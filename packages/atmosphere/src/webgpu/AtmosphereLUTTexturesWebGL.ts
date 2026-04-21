import {
  LinearFilter,
  NoColorSpace,
  RenderTarget,
  RenderTarget3D,
  RGBAFormat,
  type Data3DTexture,
  type Texture,
  type Vector2,
  type Vector3
} from 'three'
import {
  acos,
  cos,
  float,
  Fn,
  Loop,
  mrt,
  screenCoordinate,
  sin,
  sqrt,
  texture,
  texture3D,
  uniform,
  vec2,
  vec3,
  vec4
} from 'three/tsl'
import {
  NodeMaterial,
  QuadMesh,
  type Renderer,
  type UniformNode
} from 'three/webgpu'
import invariant from 'tiny-invariant'

import type { AnyFloatType } from '@takram/three-geospatial'
import { FnVar, type Node } from '@takram/three-geospatial/webgpu'

import type {
  AtmosphereLUTTexture3DName,
  AtmosphereLUTTextureName
} from './AtmosphereLUTNode'
import {
  AtmosphereLUTTextures,
  AtmosphereLUTTexturesContext
} from './AtmosphereLUTTextures'
import type { AtmosphereParameters } from './AtmosphereParameters'
import {
  computeMultipleScatteringTexture,
  computeScatteringTexture,
  getTextureUnitFromSubUV
} from './multiscattering'
import {
  computeIrradianceTexture,
  computeTransmittanceTexture
} from './precompute'

function createRenderTarget(name: string): RenderTarget {
  const renderTarget = new RenderTarget(1, 1, {
    depthBuffer: false,
    format: RGBAFormat
  })
  const texture = renderTarget.texture
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.colorSpace = NoColorSpace
  texture.generateMipmaps = false
  texture.name = name
  return renderTarget
}

function createRenderTarget3D(name: string): RenderTarget3D {
  const renderTarget = new RenderTarget3D(1, 1, 1, {
    depthBuffer: false,
    format: RGBAFormat
  })
  const texture = renderTarget.texture as unknown as Data3DTexture
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.colorSpace = NoColorSpace
  texture.generateMipmaps = false
  texture.name = name
  return renderTarget
}

function setupRenderTarget(
  renderTarget: RenderTarget,
  textureType: AnyFloatType,
  size: Vector2
): void {
  renderTarget.texture.type = textureType
  renderTarget.setSize(size.x, size.y)
}

function setupRenderTarget3D(
  renderTarget: RenderTarget3D,
  textureType: AnyFloatType,
  size: Vector3
): void {
  renderTarget.texture.type = textureType
  renderTarget.setSize(size.x, size.y, size.z)
  // As of r178, calling setSize() to a RenderTarget3D marks the texture as an
  // array texture, and subsequent calls to the texture in the GPU cannot find
  // overloaded functions.
  renderTarget.texture.isArrayTexture = false
}

class AtmosphereLUTTexturesContextWebGL extends AtmosphereLUTTexturesContext {}

export class AtmosphereLUTTexturesWebGL extends AtmosphereLUTTextures {
  private readonly transmittanceRT: RenderTarget
  private readonly multipleScatteringRT: RenderTarget
  private readonly scatteringRT: RenderTarget3D
  private readonly singleMieScatteringRT: RenderTarget3D
  private readonly higherOrderScatteringRT: RenderTarget3D
  private readonly irradianceRT: RenderTarget

  private readonly mesh = new QuadMesh()

  private transmittanceMaterial?: NodeMaterial
  private multipleScatteringMaterial?: NodeMaterial
  private scatteringMaterial?: NodeMaterial
  private irradianceMaterial?: NodeMaterial

  private readonly layer = uniform(0)

  constructor() {
    super()
    this.mesh.name = 'AtmosphereLUTTexturesWebGL'

    this.transmittanceRT = createRenderTarget('transmittance')
    this.multipleScatteringRT = createRenderTarget('multipleScattering')
    this.scatteringRT = createRenderTarget3D('scattering')
    this.singleMieScatteringRT = createRenderTarget3D('singleMieScattering')
    this.higherOrderScatteringRT = createRenderTarget3D('higherOrderScattering')
    this.irradianceRT = createRenderTarget('irradiance')
  }

  get(name: AtmosphereLUTTextureName | AtmosphereLUTTexture3DName): Texture {
    return this[`${name}RT`].texture
  }

  override createContext(): AtmosphereLUTTexturesContextWebGL {
    invariant(this.parameters != null)
    invariant(this.textureType != null)
    return new AtmosphereLUTTexturesContextWebGL(
      this.parameters,
      this.textureType
    )
  }

  private renderToRenderTarget(
    renderer: Renderer,
    renderTarget: RenderTarget,
    textures?: ReadonlyArray<Texture | undefined>
  ): void {
    if (textures != null) {
      renderTarget.textures.push(...textures.filter(value => value != null))
    }
    renderer.setRenderTarget(renderTarget)
    this.mesh.render(renderer)
    renderTarget.textures.length = 1
  }

  private renderToRenderTarget3D(
    renderer: Renderer,
    renderTarget: RenderTarget3D,
    layer: UniformNode<number>,
    textures?: ReadonlyArray<Texture | undefined>
  ): void {
    if (textures != null) {
      renderTarget.textures.push(...textures.filter(value => value != null))
    }
    for (let i = 0; i < renderTarget.depth; ++i) {
      layer.value = i
      renderer.setRenderTarget(renderTarget, i)
      this.mesh.render(renderer)
    }
    renderTarget.textures.length = 1
  }

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  private createMaterial(fragmentNode: Node): NodeMaterial {
    const material = new NodeMaterial()
    material.fragmentNode = fragmentNode
    material.needsUpdate = true
    return material
  }

  computeTransmittance(
    renderer: Renderer,
    context: AtmosphereLUTTexturesContextWebGL
  ): void {
    this.transmittanceMaterial ??= this.createMaterial(
      // BUG: Context is not merged unless we wrap the node by OutputStructNode.
      mrt({
        transmittance: computeTransmittanceTexture(screenCoordinate).context({
          getAtmosphere: () => context
        })
      })
    )
    this.mesh.material = this.transmittanceMaterial

    this.renderToRenderTarget(renderer, this.transmittanceRT)
  }

  computeMultipleScattering(
    renderer: Renderer,
    context: AtmosphereLUTTexturesContextWebGL
  ): void {
    const { parameters, parametersNode } = context

    const sampleCount = 64

    const getRayDirection = FnVar((index: Node<'uint'>): Node<'vec3'> => {
      // In the original implementation, theta and phi are uniformly
      // distributed, but they shows artifacts at higher altitudes.
      const sample = float(index)
      const theta = sample.mul((2 * Math.PI) / ((1 + Math.sqrt(5)) / 2))
      const phi = acos(
        sample
          .add(0.5)
          .mul(2 / sampleCount)
          .oneMinus()
      )
      const cosPhi = cos(phi)
      const sinPhi = sin(phi)
      const cosTheta = cos(theta)
      const sinTheta = sin(theta)
      return vec3(cosTheta.mul(sinPhi), sinTheta.mul(sinPhi), cosPhi)
    })

    const getMultipleScattering = Fn(() => {
      const size = vec2(parameters.multipleScatteringTextureSize)
      const uv = getTextureUnitFromSubUV(
        screenCoordinate.div(size),
        size
      ).toConst()

      // Construct the parameters of the high-order scattering LUT. They are
      // the cosine of light and zenith [-1, 1], and the view altitude
      // [bottomRadius, topRadius].
      const { topRadius, bottomRadius } = parametersNode
      const cosLightZenith = uv.x.mul(2).sub(1).toConst()
      const lightDirection = vec3(
        0,
        sqrt(cosLightZenith.pow2().oneMinus().saturate()),
        cosLightZenith
      ).toConst()
      const radiusOffset = 0
      const radius = bottomRadius
        .add(
          uv.y
            .add(radiusOffset)
            .saturate()
            .mul(topRadius.sub(bottomRadius).sub(radiusOffset))
        )
        .toConst()

      const totalMultipleScattering = vec3(0).toVar()
      const totalTransferFactor = vec3(0).toVar()

      Loop({ start: 0, end: sampleCount }, ({ i: index }) => {
        const rayDirection = getRayDirection(index).toConst()
        const cosView = rayDirection.z // rayOrigin is (0, 0, radius)
        const cosViewLight = rayDirection.dot(lightDirection).toConst()

        // Integrate the second-order scattering. This outputs the integrated
        // radiance here (as opposed to luminance) as well as the "transfer
        // factor", which acts as a transfer function on the irradiance of a
        // directional light at a given point.
        const result = computeMultipleScatteringTexture(
          parametersNode,
          texture(this.transmittanceRT.texture),
          radius,
          cosView,
          cosLightZenith,
          cosViewLight
        )
          .context({ getAtmosphere: () => context })
          .toConst()

        // Sum all second-order scattering integrated along the ray directions
        // with respect to the LUT parameters.
        totalMultipleScattering.addAssign(
          result.get('multipleScattering').div(sampleCount)
        )
        totalTransferFactor.addAssign(
          result.get('transferFactor').div(sampleCount)
        )
      })

      // This represents the amount of radiance scattered as if the integral
      // of scattered radiance over the sphere would be 1.
      // For a power-series, such integral is analytically:
      // sum_{n=0}^{n=+inf} = 1 + r + r^2 + r^3 + ... + r^n = 1 / (1 - r)
      return totalMultipleScattering.mul(
        totalTransferFactor.oneMinus().reciprocal()
      )
    })

    this.multipleScatteringMaterial ??= this.createMaterial(
      // BUG: Context is not merged unless we wrap the node by
      // OutputStructNode.
      mrt({
        multipleScattering: vec4(getMultipleScattering(), 1)
      })
    )
    this.mesh.material = this.multipleScatteringMaterial

    this.renderToRenderTarget(renderer, this.multipleScatteringRT)
  }

  computeScattering(
    renderer: Renderer,
    context: AtmosphereLUTTexturesContextWebGL
  ): void {
    const { parameters } = context

    this.scatteringMaterial ??= this.createMaterial(
      (() => {
        const result = computeScatteringTexture(
          texture(this.transmittanceRT.texture),
          texture(this.multipleScatteringRT.texture),
          vec3(screenCoordinate, this.layer.add(0.5))
        )
          .context({ getAtmosphere: () => context })
          .toConst()

        const scattering = result.get('scattering')
        const singleMieScattering = result.get('singleMieScattering')
        const higherOrderScattering = result.get('higherOrderScattering')

        const outputNodes: Record<string, Node> = {}
        if (parameters.combinedScatteringTextures) {
          outputNodes.scattering = vec4(scattering, singleMieScattering.r)
        } else {
          outputNodes.scattering = vec4(scattering, singleMieScattering.r)
          outputNodes.singleMieScattering = vec4(singleMieScattering, 1)
        }
        if (parameters.higherOrderScatteringTexture) {
          outputNodes.higherOrderScattering = vec4(higherOrderScattering, 1)
        }
        return mrt(outputNodes)
      })()
    )
    this.mesh.material = this.scatteringMaterial

    const textures: Texture[] = []
    if (!parameters.combinedScatteringTextures) {
      textures.push(this.singleMieScatteringRT.texture)
    }
    if (parameters.higherOrderScatteringTexture) {
      textures.push(this.higherOrderScatteringRT.texture)
    }
    this.renderToRenderTarget3D(
      renderer,
      this.scatteringRT,
      this.layer,
      textures
    )
  }

  computeIrradiance(
    renderer: Renderer,
    context: AtmosphereLUTTexturesContextWebGL
  ): void {
    this.irradianceMaterial ??= this.createMaterial(
      // BUG: Context is not merged unless we wrap the node by OutputStructNode.
      mrt({
        irradiance: computeIrradianceTexture(
          texture3D(this.scatteringRT.texture),
          screenCoordinate
        ).context({ getAtmosphere: () => context })
      })
    )
    this.mesh.material = this.irradianceMaterial

    this.renderToRenderTarget(renderer, this.irradianceRT)
  }

  override setup(
    parameters: AtmosphereParameters,
    textureType: AnyFloatType
  ): void {
    setupRenderTarget(
      this.transmittanceRT,
      textureType,
      parameters.transmittanceTextureSize
    )
    setupRenderTarget(
      this.multipleScatteringRT,
      textureType,
      parameters.multipleScatteringTextureSize
    )
    setupRenderTarget3D(
      this.scatteringRT,
      textureType,
      parameters.scatteringTextureSize
    )
    if (!parameters.combinedScatteringTextures) {
      setupRenderTarget3D(
        this.singleMieScatteringRT,
        textureType,
        parameters.scatteringTextureSize
      )
    }
    if (parameters.higherOrderScatteringTexture) {
      setupRenderTarget3D(
        this.higherOrderScatteringRT,
        textureType,
        parameters.scatteringTextureSize
      )
    }
    setupRenderTarget(
      this.irradianceRT,
      textureType,
      parameters.irradianceTextureSize
    )
    super.setup(parameters, textureType)
  }

  override dispose(): void {
    this.transmittanceRT.dispose()
    this.multipleScatteringRT.dispose()
    this.scatteringRT.dispose()
    this.irradianceRT.dispose()
    this.transmittanceMaterial?.dispose()
    this.multipleScatteringMaterial?.dispose()
    this.scatteringMaterial?.dispose()
    this.irradianceMaterial?.dispose()
    this.mesh.geometry.dispose()
    super.dispose()
  }
}
