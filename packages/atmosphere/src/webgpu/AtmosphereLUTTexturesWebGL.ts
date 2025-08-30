import {
  AddEquation,
  Box3,
  CustomBlending,
  LinearFilter,
  NoBlending,
  NoColorSpace,
  OneFactor,
  RenderTarget,
  RenderTarget3D,
  RGBAFormat,
  Vector3,
  type Data3DTexture,
  type Texture,
  type Vector2
} from 'three'
import {
  exp,
  int,
  mrt,
  screenCoordinate,
  texture,
  texture3D,
  uniform,
  vec3,
  vec4
} from 'three/tsl'
import {
  NodeMaterial,
  QuadMesh,
  type Renderer,
  type UniformNode
} from 'three/webgpu'

import type { AnyFloatType } from '@takram/three-geospatial'
import type { NodeObject } from '@takram/three-geospatial/webgpu'

import type {
  AtmosphereLUTTexture3DName,
  AtmosphereLUTTextureName
} from './AtmosphereLUTNode'
import {
  AtmosphereLUTTextures,
  AtmosphereLUTTexturesContext
} from './AtmosphereLUTTextures'
import type { AtmosphereParameters } from './AtmosphereParameters'
import { rayleighPhaseFunction } from './common'
import {
  computeDirectIrradianceTexture,
  computeIndirectIrradianceTexture,
  computeMultipleScatteringTexture,
  computeScatteringDensityTexture,
  computeSingleScatteringTexture,
  computeTransmittanceToTopAtmosphereBoundaryTexture
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

function clearRenderTarget(
  renderer: Renderer,
  renderTarget?: RenderTarget
): void {
  if (renderTarget != null) {
    if (renderTarget instanceof RenderTarget3D) {
      for (let i = 0; i < renderTarget.depth; ++i) {
        renderer.setRenderTarget(renderTarget, i)
        void renderer.clearColor()
      }
    } else {
      renderer.setRenderTarget(renderTarget)
      void renderer.clearColor()
    }
  }
}

class AtmosphereLUTTexturesContextWebGL extends AtmosphereLUTTexturesContext {
  opticalDepthRT = createRenderTarget('opticalDepth')
  deltaIrradianceRT = createRenderTarget('deltaIrradiance')
  deltaRayleighScatteringRT = createRenderTarget3D('deltaRayleighScattering')
  deltaMieScatteringRT = createRenderTarget3D('deltaMieScattering')
  deltaScatteringDensityRT = createRenderTarget3D('deltaScatteringDensity')

  // deltaMultipleScattering is only needed to compute scattering order 3 or
  // more, while deltaRayleighScattering and deltaMieScattering are only needed
  // to compute double scattering. Therefore, to save memory, we can store
  // deltaRayleighScattering and deltaMultipleScattering in the same GPU
  // texture.
  deltaMultipleScatteringRT = this.deltaRayleighScatteringRT

  constructor(textureType: AnyFloatType, parameters: AtmosphereParameters) {
    super()

    if (parameters.transmittancePrecisionLog) {
      setupRenderTarget(
        this.opticalDepthRT,
        textureType,
        parameters.transmittanceTextureSize
      )
    }
    setupRenderTarget(
      this.deltaIrradianceRT,
      textureType,
      parameters.irradianceTextureSize
    )
    setupRenderTarget3D(
      this.deltaRayleighScatteringRT,
      textureType,
      parameters.scatteringTextureSize
    )
    setupRenderTarget3D(
      this.deltaMieScatteringRT,
      textureType,
      parameters.scatteringTextureSize
    )
    setupRenderTarget3D(
      this.deltaScatteringDensityRT,
      textureType,
      parameters.scatteringTextureSize
    )
  }

  dispose(): void {
    this.opticalDepthRT.dispose()
    this.deltaIrradianceRT.dispose()
    this.deltaRayleighScatteringRT.dispose()
    this.deltaMieScatteringRT.dispose()
    this.deltaScatteringDensityRT.dispose()
  }
}

class AdditiveNodeMaterial extends NodeMaterial {
  override blendEquation = AddEquation
  override blendEquationAlpha = AddEquation
  override blendSrc = OneFactor
  override blendDst = OneFactor
  override blendSrcAlpha = OneFactor
  override blendDstAlpha = OneFactor

  // eslint-disable-next-line accessor-pairs
  set additive(value: boolean) {
    this.transparent = value
    this.blending = value ? CustomBlending : NoBlending
  }
}

export class AtmosphereLUTTexturesWebGL extends AtmosphereLUTTextures {
  private readonly transmittanceRT = createRenderTarget('transmittance')
  private readonly irradianceRT = createRenderTarget('irradiance')
  private readonly scatteringRT = createRenderTarget3D('scattering')
  private readonly singleMieScatteringRT = createRenderTarget3D(
    'singleMieScattering'
  )
  private readonly higherOrderScatteringRT = createRenderTarget3D(
    'higherOrderScattering'
  )

  private readonly material = new AdditiveNodeMaterial()
  private readonly mesh = new QuadMesh(this.material)

  private transmittanceNode?: NodeObject<any>
  private directIrradianceNode?: NodeObject<any>
  private singleScatteringNode?: NodeObject<any>
  private scatteringDensityNode?: NodeObject<any>
  private indirectIrradianceNode?: NodeObject<any>
  private multipleScatteringNode?: NodeObject<any>

  private readonly layer = uniform(0)
  private readonly scatteringOrder = uniform(0)

  get(name: AtmosphereLUTTextureName | AtmosphereLUTTexture3DName): Texture {
    return this[`${name}RT`].texture
  }

  override createContext(
    textureType: AnyFloatType,
    parameters: AtmosphereParameters
  ): AtmosphereLUTTexturesContextWebGL {
    return new AtmosphereLUTTexturesContextWebGL(textureType, parameters)
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

  computeTransmittance(
    renderer: Renderer,
    { opticalDepthRT }: AtmosphereLUTTexturesContextWebGL
  ): void {
    const { parameters } = this

    this.transmittanceNode ??= (() => {
      const transmittance = computeTransmittanceToTopAtmosphereBoundaryTexture(
        screenCoordinate
      ).context({ atmosphere: { parameters } })

      return parameters.transmittancePrecisionLog
        ? // Compute the optical depth, and store it in opticalDepth. Avoid
          // having tiny transmittance values underflow to 0 due to half-float
          // precision.
          mrt({
            transmittance: exp(transmittance.negate()),
            opticalDepth: transmittance
          })
        : transmittance
    })()

    this.material.fragmentNode = this.transmittanceNode
    this.material.additive = false
    this.material.needsUpdate = true

    this.renderToRenderTarget(renderer, this.transmittanceRT, [
      parameters.transmittancePrecisionLog ? opticalDepthRT.texture : undefined
    ])
  }

  computeDirectIrradiance(
    renderer: Renderer,
    { deltaIrradianceRT, opticalDepthRT }: AtmosphereLUTTexturesContextWebGL
  ): void {
    const { parameters } = this

    this.directIrradianceNode ??= (() => {
      const irradiance = computeDirectIrradianceTexture(
        texture(
          parameters.transmittancePrecisionLog
            ? opticalDepthRT.texture
            : this.transmittanceRT.texture
        ),
        screenCoordinate
      ).context({ atmosphere: { parameters } })

      return mrt({
        deltaIrradiance: vec4(irradiance, 1),
        irradiance: vec4(vec3(0), 1)
      })
    })()

    this.material.fragmentNode = this.directIrradianceNode
    this.material.additive = true
    this.material.needsUpdate = true

    // Turn off blending on the deltaIrradiance.
    clearRenderTarget(renderer, deltaIrradianceRT)

    this.renderToRenderTarget(renderer, this.irradianceRT, [
      deltaIrradianceRT.texture
    ])
  }

  computeSingleScattering(
    renderer: Renderer,
    {
      luminanceFromRadiance,
      deltaRayleighScatteringRT,
      deltaMieScatteringRT,
      opticalDepthRT
    }: AtmosphereLUTTexturesContextWebGL
  ): void {
    const { parameters } = this

    this.singleScatteringNode ??= (() => {
      const singleScattering = computeSingleScatteringTexture(
        texture(
          parameters.transmittancePrecisionLog
            ? opticalDepthRT.texture
            : this.transmittanceRT.texture
        ),
        vec3(screenCoordinate, this.layer.add(0.5))
      ).context({ atmosphere: { parameters } })

      const rayleigh = singleScattering.get('rayleigh')
      const mie = singleScattering.get('mie')

      return mrt({
        scattering: vec4(
          rayleigh.mul(luminanceFromRadiance),
          mie.mul(luminanceFromRadiance).r
        ),
        deltaRayleighScattering: vec4(rayleigh, 1),
        deltaMieScattering: vec4(mie.mul(luminanceFromRadiance), 1)
      })
    })()

    this.material.fragmentNode = this.singleScatteringNode
    this.material.additive = true
    this.material.needsUpdate = true

    // Turn off blending on the deltaRayleighScattering and deltaMieScattering.
    clearRenderTarget(renderer, deltaRayleighScatteringRT)
    clearRenderTarget(renderer, deltaMieScatteringRT)

    this.renderToRenderTarget3D(renderer, this.scatteringRT, this.layer, [
      deltaRayleighScatteringRT.texture,
      deltaMieScatteringRT.texture
    ])

    if (!parameters.combinedScatteringTextures) {
      clearRenderTarget(renderer, this.singleMieScatteringRT)
      renderer.copyTextureToTexture(
        deltaMieScatteringRT.texture,
        this.singleMieScatteringRT.texture,
        new Box3(new Vector3(), parameters.scatteringTextureSize)
      )
    }
  }

  computeScatteringDensity(
    renderer: Renderer,
    {
      deltaIrradianceRT,
      deltaRayleighScatteringRT,
      deltaMieScatteringRT,
      deltaScatteringDensityRT,
      deltaMultipleScatteringRT,
      opticalDepthRT
    }: AtmosphereLUTTexturesContextWebGL,
    scatteringOrder: number
  ): void {
    const { parameters } = this

    this.scatteringDensityNode ??= (() => {
      const radiance = computeScatteringDensityTexture(
        texture(
          parameters.transmittancePrecisionLog
            ? opticalDepthRT.texture
            : this.transmittanceRT.texture
        ),
        texture3D(deltaRayleighScatteringRT.texture),
        texture3D(deltaMieScatteringRT.texture),
        texture3D(deltaMultipleScatteringRT.texture),
        texture(deltaIrradianceRT.texture),
        vec3(screenCoordinate, this.layer.add(0.5)),
        int(this.scatteringOrder)
      ).context({ atmosphere: { parameters } })

      return vec4(radiance, 1)
    })()

    this.material.fragmentNode = this.scatteringDensityNode
    this.material.additive = false
    this.material.needsUpdate = true

    this.scatteringOrder.value = scatteringOrder
    this.renderToRenderTarget3D(renderer, deltaScatteringDensityRT, this.layer)
  }

  computeIndirectIrradiance(
    renderer: Renderer,
    {
      luminanceFromRadiance,
      deltaIrradianceRT,
      deltaRayleighScatteringRT,
      deltaMieScatteringRT,
      deltaMultipleScatteringRT
    }: AtmosphereLUTTexturesContextWebGL,
    scatteringOrder: number
  ): void {
    const { parameters } = this

    this.indirectIrradianceNode ??= (() => {
      const irradiance = computeIndirectIrradianceTexture(
        texture3D(deltaRayleighScatteringRT.texture),
        texture3D(deltaMieScatteringRT.texture),
        texture3D(deltaMultipleScatteringRT.texture),
        screenCoordinate,
        int(this.scatteringOrder.sub(1))
      ).context({ atmosphere: { parameters } })

      return mrt({
        deltaIrradiance: irradiance,
        irradiance: irradiance.mul(luminanceFromRadiance)
      })
    })()

    this.material.fragmentNode = this.indirectIrradianceNode
    this.material.additive = true
    this.material.needsUpdate = true

    // Turn off blending on the deltaIrradiance.
    clearRenderTarget(renderer, deltaIrradianceRT)

    this.scatteringOrder.value = scatteringOrder
    this.renderToRenderTarget(renderer, this.irradianceRT, [
      deltaIrradianceRT.texture
    ])
  }

  computeMultipleScattering(
    renderer: Renderer,
    {
      luminanceFromRadiance,
      deltaScatteringDensityRT,
      deltaMultipleScatteringRT,
      opticalDepthRT
    }: AtmosphereLUTTexturesContextWebGL
  ): void {
    const { parameters } = this

    this.multipleScatteringNode ??= (() => {
      const multipleScattering = computeMultipleScatteringTexture(
        texture(
          parameters.transmittancePrecisionLog
            ? opticalDepthRT.texture
            : this.transmittanceRT.texture
        ),
        texture3D(deltaScatteringDensityRT.texture),
        vec3(screenCoordinate, this.layer.add(0.5))
      ).context({ atmosphere: { parameters } })

      const radiance = multipleScattering.get('radiance')
      const cosViewSun = multipleScattering.get('cosViewSun')
      const luminance = radiance
        .mul(luminanceFromRadiance)
        .div(rayleighPhaseFunction(cosViewSun))

      return mrt({
        scattering: vec4(luminance, 0),
        // deltaMultipleScattering is shared with deltaRayleighScattering.
        deltaRayleighScattering: vec4(radiance, 1),
        ...(parameters.higherOrderScatteringTexture && {
          higherOrderScattering: vec4(luminance, 1)
        })
      })
    })()

    this.material.fragmentNode = this.multipleScatteringNode
    this.material.additive = true
    this.material.needsUpdate = true

    // Turn off blending on the deltaMultipleScattering.
    clearRenderTarget(renderer, deltaMultipleScatteringRT)

    this.renderToRenderTarget3D(renderer, this.scatteringRT, this.layer, [
      deltaMultipleScatteringRT.texture,
      parameters.higherOrderScatteringTexture
        ? this.higherOrderScatteringRT.texture
        : undefined
    ])
  }

  override setup(textureType: AnyFloatType): void {
    const { parameters } = this
    setupRenderTarget(
      this.transmittanceRT,
      textureType,
      parameters.transmittanceTextureSize
    )
    setupRenderTarget(
      this.irradianceRT,
      textureType,
      parameters.irradianceTextureSize
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
  }

  override dispose(): void {
    this.transmittanceRT.dispose()
    this.irradianceRT.dispose()
    this.scatteringRT.dispose()
    this.singleMieScatteringRT.dispose()
    this.higherOrderScatteringRT.dispose()
    this.material.dispose()
    super.dispose()
  }
}
