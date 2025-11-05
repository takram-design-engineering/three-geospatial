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
  type Data3DTexture,
  type Texture,
  type Vector2,
  type Vector3
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
import invariant from 'tiny-invariant'

import type { AnyFloatType } from '@takram/three-geospatial'
import type { Node } from '@takram/three-geospatial/webgpu'

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
        renderer.clearColor()
      }
    } else {
      renderer.setRenderTarget(renderTarget)
      renderer.clearColor()
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

  constructor(parameters: AtmosphereParameters, textureType: AnyFloatType) {
    super(parameters, textureType)

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

  override dispose(): void {
    this.opticalDepthRT.dispose()
    this.deltaIrradianceRT.dispose()
    this.deltaRayleighScatteringRT.dispose()
    this.deltaMieScatteringRT.dispose()
    this.deltaScatteringDensityRT.dispose()
    super.dispose()
  }
}

class AdditiveMaterial extends NodeMaterial {
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

const boxScratch = /*#__PURE__*/ new Box3()

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

  private readonly mesh = new QuadMesh()

  private transmittanceMaterial?: AdditiveMaterial
  private directIrradianceMaterial?: AdditiveMaterial
  private singleScatteringMaterial?: AdditiveMaterial
  private scatteringDensityMaterial?: AdditiveMaterial
  private indirectIrradianceMaterial?: AdditiveMaterial
  private multipleScatteringMaterial?: AdditiveMaterial

  private readonly layer = uniform(0)
  private readonly scatteringOrder = uniform(0)

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
  private createMaterial(params: {
    additive: boolean
    fragmentNode: Node
  }): AdditiveMaterial {
    const material = new AdditiveMaterial()
    material.fragmentNode = params.fragmentNode
    material.additive = params.additive
    material.needsUpdate = true
    return material
  }

  computeTransmittance(
    renderer: Renderer,
    context: AtmosphereLUTTexturesContextWebGL
  ): void {
    const { parameters, opticalDepthRT } = context

    this.transmittanceMaterial ??= this.createMaterial({
      additive: false,
      fragmentNode: (() => {
        const transmittance =
          computeTransmittanceToTopAtmosphereBoundaryTexture(
            screenCoordinate
          ).context({ atmosphere: context })

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
    })
    this.mesh.material = this.transmittanceMaterial

    this.renderToRenderTarget(renderer, this.transmittanceRT, [
      parameters.transmittancePrecisionLog ? opticalDepthRT.texture : undefined
    ])
  }

  computeDirectIrradiance(
    renderer: Renderer,
    context: AtmosphereLUTTexturesContextWebGL
  ): void {
    const { parameters, deltaIrradianceRT, opticalDepthRT } = context

    this.directIrradianceMaterial ??= this.createMaterial({
      additive: true,
      fragmentNode: (() => {
        const irradiance = computeDirectIrradianceTexture(
          texture(
            parameters.transmittancePrecisionLog
              ? opticalDepthRT.texture
              : this.transmittanceRT.texture
          ),
          screenCoordinate
        ).context({ atmosphere: context })

        return mrt({
          deltaIrradiance: vec4(irradiance, 1),
          irradiance: vec4(vec3(0), 1)
        })
      })()
    })
    this.mesh.material = this.directIrradianceMaterial

    // Turn off blending on the deltaIrradiance.
    clearRenderTarget(renderer, deltaIrradianceRT)

    this.renderToRenderTarget(renderer, this.irradianceRT, [
      deltaIrradianceRT.texture
    ])
  }

  computeSingleScattering(
    renderer: Renderer,
    context: AtmosphereLUTTexturesContextWebGL
  ): void {
    const {
      parameters,
      luminanceFromRadiance,
      deltaRayleighScatteringRT,
      deltaMieScatteringRT,
      opticalDepthRT
    } = context

    this.singleScatteringMaterial ??= this.createMaterial({
      additive: true,
      fragmentNode: (() => {
        const singleScattering = computeSingleScatteringTexture(
          texture(
            parameters.transmittancePrecisionLog
              ? opticalDepthRT.texture
              : this.transmittanceRT.texture
          ),
          vec3(screenCoordinate, this.layer.add(0.5))
        ).context({ atmosphere: context })

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
    })
    this.mesh.material = this.singleScatteringMaterial

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
        boxScratch.set(
          boxScratch.min.setScalar(0),
          parameters.scatteringTextureSize
        )
      )
    }
  }

  computeScatteringDensity(
    renderer: Renderer,
    context: AtmosphereLUTTexturesContextWebGL,
    scatteringOrder: number
  ): void {
    const {
      parameters,
      deltaIrradianceRT,
      deltaRayleighScatteringRT,
      deltaMieScatteringRT,
      deltaScatteringDensityRT,
      deltaMultipleScatteringRT,
      opticalDepthRT
    } = context

    this.scatteringDensityMaterial ??= this.createMaterial({
      additive: false,
      fragmentNode: (() => {
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
        ).context({ atmosphere: context })

        return vec4(radiance, 1)
      })()
    })
    this.mesh.material = this.scatteringDensityMaterial

    this.scatteringOrder.value = scatteringOrder
    this.renderToRenderTarget3D(renderer, deltaScatteringDensityRT, this.layer)
  }

  computeIndirectIrradiance(
    renderer: Renderer,
    context: AtmosphereLUTTexturesContextWebGL,
    scatteringOrder: number
  ): void {
    const {
      luminanceFromRadiance,
      deltaIrradianceRT,
      deltaRayleighScatteringRT,
      deltaMieScatteringRT,
      deltaMultipleScatteringRT
    } = context

    this.indirectIrradianceMaterial ??= this.createMaterial({
      additive: true,
      fragmentNode: (() => {
        const irradiance = computeIndirectIrradianceTexture(
          texture3D(deltaRayleighScatteringRT.texture),
          texture3D(deltaMieScatteringRT.texture),
          texture3D(deltaMultipleScatteringRT.texture),
          screenCoordinate,
          int(this.scatteringOrder.sub(1))
        ).context({ atmosphere: context })

        return mrt({
          deltaIrradiance: irradiance,
          irradiance: irradiance.mul(luminanceFromRadiance)
        })
      })()
    })
    this.mesh.material = this.indirectIrradianceMaterial

    // Turn off blending on the deltaIrradiance.
    clearRenderTarget(renderer, deltaIrradianceRT)

    this.scatteringOrder.value = scatteringOrder
    this.renderToRenderTarget(renderer, this.irradianceRT, [
      deltaIrradianceRT.texture
    ])
  }

  computeMultipleScattering(
    renderer: Renderer,
    context: AtmosphereLUTTexturesContextWebGL
  ): void {
    const {
      parameters,
      luminanceFromRadiance,
      deltaScatteringDensityRT,
      deltaMultipleScatteringRT,
      opticalDepthRT
    } = context

    this.multipleScatteringMaterial ??= this.createMaterial({
      additive: true,
      fragmentNode: (() => {
        const multipleScattering = computeMultipleScatteringTexture(
          texture(
            parameters.transmittancePrecisionLog
              ? opticalDepthRT.texture
              : this.transmittanceRT.texture
          ),
          texture3D(deltaScatteringDensityRT.texture),
          vec3(screenCoordinate, this.layer.add(0.5))
        ).context({ atmosphere: context })

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
    })
    this.mesh.material = this.multipleScatteringMaterial

    // Turn off blending on the deltaMultipleScattering.
    clearRenderTarget(renderer, deltaMultipleScatteringRT)

    this.renderToRenderTarget3D(renderer, this.scatteringRT, this.layer, [
      deltaMultipleScatteringRT.texture,
      parameters.higherOrderScatteringTexture
        ? this.higherOrderScatteringRT.texture
        : undefined
    ])
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
    super.setup(parameters, textureType)
  }

  override dispose(): void {
    this.transmittanceRT.dispose()
    this.irradianceRT.dispose()
    this.scatteringRT.dispose()
    this.singleMieScatteringRT.dispose()
    this.higherOrderScatteringRT.dispose()
    this.transmittanceMaterial?.dispose()
    this.directIrradianceMaterial?.dispose()
    this.singleScatteringMaterial?.dispose()
    this.scatteringDensityMaterial?.dispose()
    this.indirectIrradianceMaterial?.dispose()
    this.multipleScatteringMaterial?.dispose()
    this.mesh.geometry.dispose()
    super.dispose()
  }
}
