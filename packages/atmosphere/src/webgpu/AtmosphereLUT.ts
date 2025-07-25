import {
  AddEquation,
  ClampToEdgeWrapping,
  CustomBlending,
  Data3DTexture,
  FloatType,
  HalfFloatType,
  LinearFilter,
  NoBlending,
  NoColorSpace,
  OneFactor,
  RenderTarget,
  RenderTarget3D,
  RGBAFormat,
  type Texture
} from 'three'
import {
  int,
  mat3,
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

import {
  IRRADIANCE_TEXTURE_HEIGHT,
  IRRADIANCE_TEXTURE_WIDTH,
  SCATTERING_TEXTURE_DEPTH,
  SCATTERING_TEXTURE_HEIGHT,
  SCATTERING_TEXTURE_WIDTH,
  TRANSMITTANCE_TEXTURE_HEIGHT,
  TRANSMITTANCE_TEXTURE_WIDTH
} from '../constants'
import { rayleighPhaseFunction } from './common'
import { AtmosphereParams } from './definitions'
import {
  computeDirectIrradianceTexture,
  computeIndirectIrradianceTexture,
  computeMultipleScatteringTexture,
  computeScatteringDensityTexture,
  computeSingleScatteringTexture,
  computeTransmittanceToTopAtmosphereBoundaryTexture
} from './precompute'

declare module 'three' {
  interface RenderTarget3D {
    texture: Data3DTexture
    textures: Data3DTexture[]
  }
}

function createRenderTarget(
  textureType: AnyFloatType,
  width: number,
  height: number,
  name: string
): RenderTarget {
  const renderTarget = new RenderTarget(width, height, {
    depthBuffer: false,
    type: textureType,
    format: RGBAFormat,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    wrapS: ClampToEdgeWrapping,
    wrapT: ClampToEdgeWrapping,
    colorSpace: NoColorSpace
  })
  renderTarget.texture.name = name
  return renderTarget
}

function createRenderTarget3D(
  textureType: AnyFloatType,
  width: number,
  height: number,
  depth: number,
  name: string
): RenderTarget3D {
  const renderTarget = new RenderTarget3D(width, height, depth, {
    depthBuffer: false,
    type: textureType,
    format: RGBAFormat
  })
  const texture = renderTarget.texture
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.wrapR = ClampToEdgeWrapping
  texture.colorSpace = NoColorSpace
  texture.name = name
  return renderTarget
}

function createTexture3D(
  textureType: AnyFloatType,
  width: number,
  height: number,
  depth: number,
  name: string
): Data3DTexture {
  const texture = new Data3DTexture(null, width, height, depth)
  texture.isRenderTargetTexture = true
  texture.type = textureType
  texture.format = RGBAFormat
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.colorSpace = NoColorSpace
  texture.name = name
  return texture
}

// eslint-disable-next-line @typescript-eslint/promise-function-async
function iterateIdle<T>(iterable: Iterable<T>): Promise<T> {
  const iterator = iterable[Symbol.iterator]()
  return new Promise<T>((resolve, reject) => {
    const callback = (): void => {
      try {
        const { value, done } = iterator.next()
        if (done === true) {
          resolve(value)
        } else {
          requestIdleCallback(callback)
        }
      } catch (error: unknown) {
        reject(error instanceof Error ? error : new Error())
      }
    }
    requestIdleCallback(callback)
  })
}

class Context {
  lambdas = vec3()
  luminanceFromRadiance = mat3()
  opticalDepth?: RenderTarget
  deltaIrradiance: RenderTarget
  deltaRayleighScattering: RenderTarget3D
  deltaMieScattering: RenderTarget3D
  deltaScatteringDensity: RenderTarget3D
  deltaMultipleScattering: RenderTarget3D

  constructor(type: AnyFloatType) {
    if (type === HalfFloatType) {
      this.opticalDepth = createRenderTarget(
        type,
        TRANSMITTANCE_TEXTURE_WIDTH,
        TRANSMITTANCE_TEXTURE_HEIGHT,
        'transmittance'
      )
    }
    this.deltaIrradiance = createRenderTarget(
      type,
      IRRADIANCE_TEXTURE_WIDTH,
      IRRADIANCE_TEXTURE_HEIGHT,
      'deltaIrradiance'
    )
    this.deltaRayleighScattering = createRenderTarget3D(
      type,
      SCATTERING_TEXTURE_WIDTH,
      SCATTERING_TEXTURE_HEIGHT,
      SCATTERING_TEXTURE_DEPTH,
      'deltaRayleigh'
    )
    this.deltaMieScattering = createRenderTarget3D(
      type,
      SCATTERING_TEXTURE_WIDTH,
      SCATTERING_TEXTURE_HEIGHT,
      SCATTERING_TEXTURE_DEPTH,
      'deltaMie'
    )
    this.deltaScatteringDensity = createRenderTarget3D(
      type,
      SCATTERING_TEXTURE_WIDTH,
      SCATTERING_TEXTURE_HEIGHT,
      SCATTERING_TEXTURE_DEPTH,
      'deltaScatteringDensity'
    )
    // deltaMultipleScattering is only needed to compute scattering order 3 or
    // more, while deltaRayleighScattering and deltaMieScattering are only needed
    // to compute double scattering. Therefore, to save memory, we can store
    // deltaRayleighScattering and deltaMultipleScattering in the same GPU
    // texture.
    this.deltaMultipleScattering = this.deltaRayleighScattering
  }

  dispose(): void {
    this.opticalDepth?.dispose()
    this.deltaIrradiance.dispose()
    this.deltaRayleighScattering.dispose()
    this.deltaMieScattering.dispose()
    this.deltaScatteringDensity.dispose()
  }
}

class AdditiveNodeMaterial extends NodeMaterial {
  // eslint-disable-next-line accessor-pairs
  set additive(value: boolean) {
    this.transparent = value
    this.blending = value ? CustomBlending : NoBlending
    this.blendEquation = AddEquation
    this.blendEquationAlpha = AddEquation
    this.blendSrc = OneFactor
    this.blendDst = OneFactor
    this.blendSrcAlpha = OneFactor
    this.blendDstAlpha = OneFactor
  }
}

export interface AtmosphereLUTOptions {
  textureType?: AnyFloatType
  combinedScattering?: boolean
  higherOrderScattering?: boolean
}

export class AtmosphereLUT {
  readonly transmittanceRenderTarget: RenderTarget
  readonly scatteringRenderTarget: RenderTarget3D
  readonly irradianceRenderTarget: RenderTarget
  readonly singleMieScatteringTexture?: Data3DTexture
  readonly higherOrderScatteringTexture?: Data3DTexture

  private readonly renderer: Renderer
  private readonly textureType: AnyFloatType
  private readonly atmosphere = new AtmosphereParams()
  private readonly material = new AdditiveNodeMaterial()
  private readonly mesh = new QuadMesh(this.material)

  get transmittanceTexture(): Texture {
    return this.transmittanceRenderTarget.texture
  }

  get scatteringTexture(): Texture {
    return this.scatteringRenderTarget.texture
  }

  get irradianceTexture(): Texture {
    return this.irradianceRenderTarget.texture
  }

  constructor(
    renderer: Renderer,
    {
      textureType = FloatType,
      combinedScattering = true,
      higherOrderScattering = true
    }: AtmosphereLUTOptions = {}
  ) {
    this.renderer = renderer
    this.textureType = textureType
    this.transmittanceRenderTarget = createRenderTarget(
      textureType,
      TRANSMITTANCE_TEXTURE_WIDTH,
      TRANSMITTANCE_TEXTURE_HEIGHT,
      'transmittance'
    )
    this.scatteringRenderTarget = createRenderTarget3D(
      textureType,
      SCATTERING_TEXTURE_WIDTH,
      SCATTERING_TEXTURE_HEIGHT,
      SCATTERING_TEXTURE_DEPTH,
      'scattering'
    )
    this.irradianceRenderTarget = createRenderTarget(
      textureType,
      IRRADIANCE_TEXTURE_WIDTH,
      IRRADIANCE_TEXTURE_HEIGHT,
      'irradiance'
    )
    if (!combinedScattering) {
      this.singleMieScatteringTexture = createTexture3D(
        textureType,
        SCATTERING_TEXTURE_WIDTH,
        SCATTERING_TEXTURE_HEIGHT,
        SCATTERING_TEXTURE_DEPTH,
        'singleMieScattering'
      )
    }
    if (higherOrderScattering) {
      this.higherOrderScatteringTexture = createTexture3D(
        textureType,
        SCATTERING_TEXTURE_WIDTH,
        SCATTERING_TEXTURE_HEIGHT,
        SCATTERING_TEXTURE_DEPTH,
        'higherOrderScattering'
      )
    }

    const { material } = this
    material.depthTest = false
    material.depthWrite = false
  }

  private clearRenderTarget(renderTarget: RenderTarget): void {
    this.renderer.setRenderTarget(renderTarget)
    void this.renderer.clearColor()
  }

  private clearRenderTarget3D(renderTarget: RenderTarget3D): void {
    for (let layer = 0; layer < renderTarget.depth; ++layer) {
      this.renderer.setRenderTarget(renderTarget, layer)
      void this.renderer.clearColor()
    }
  }

  private renderToRenderTarget(
    renderTarget: RenderTarget,
    textures?: Texture[]
  ): void {
    if (textures != null) {
      renderTarget.textures.push(...textures)
    }
    this.renderer.setRenderTarget(this.transmittanceRenderTarget)
    this.mesh.render(this.renderer)
    renderTarget.textures.length = 1
  }

  private renderToRenderTarget3D(
    renderTarget: RenderTarget3D,
    layerUniform: UniformNode<number>,
    textures?: Data3DTexture[]
  ): void {
    if (textures != null) {
      renderTarget.textures.push(...textures)
    }
    for (let layer = 0; layer < renderTarget.depth; ++layer) {
      layerUniform.value = layer
      this.renderer.setRenderTarget(renderTarget, layer)
      this.mesh.render(this.renderer)
    }
    renderTarget.textures.length = 1
  }

  private computeTransmittance(): void {
    this.material.fragmentNode =
      computeTransmittanceToTopAtmosphereBoundaryTexture(
        this.atmosphere,
        screenCoordinate
      )
    this.material.additive = false
    this.material.needsUpdate = true

    this.renderToRenderTarget(this.transmittanceRenderTarget)
  }

  private computeDirectIrradiance(context: Context): void {
    const irradiance = computeDirectIrradianceTexture(
      this.atmosphere,
      texture(this.transmittanceTexture),
      screenCoordinate
    )
    this.material.fragmentNode = mrt({
      deltaIrradiance: vec4(irradiance, 1),
      irradiance: vec4(vec3(0), 1)
    })
    this.material.additive = true
    this.material.needsUpdate = true

    // Turn off blending on the deltaIrradiance.
    this.clearRenderTarget(context.deltaIrradiance)

    this.renderToRenderTarget(this.irradianceRenderTarget, [
      context.deltaIrradiance.texture
    ])
  }

  private computeSingleScattering(context: Context): void {
    const layer = uniform(0)
    const singleScattering = computeSingleScatteringTexture(
      this.atmosphere,
      texture(this.transmittanceTexture),
      vec3(screenCoordinate, layer.add(0.5))
    )
    const rayleigh = singleScattering.get('rayleigh')
    const mie = singleScattering.get('mie')
    this.material.fragmentNode = mrt({
      scattering: vec4(rayleigh.rgb, mie.r).mul(context.luminanceFromRadiance),
      deltaRayleigh: vec4(rayleigh.rgb, 1),
      deltaMie: vec4(mie.rgb, 1)
    })
    this.material.additive = true
    this.material.needsUpdate = true

    // Turn off blending on the deltaRayleighScattering and deltaMieScattering.
    this.clearRenderTarget3D(context.deltaRayleighScattering)
    this.clearRenderTarget3D(context.deltaMieScattering)

    this.renderToRenderTarget3D(this.scatteringRenderTarget, layer, [
      context.deltaRayleighScattering.texture,
      context.deltaMieScattering.texture
    ])
  }

  private computeScatteringDensity(
    context: Context,
    scatteringOrder: number
  ): void {
    const layer = uniform(0)
    const radiance = computeScatteringDensityTexture(
      this.atmosphere,
      texture(this.transmittanceTexture),
      texture3D(context.deltaRayleighScattering.texture),
      texture3D(context.deltaMieScattering.texture),
      texture3D(context.deltaMultipleScattering.texture),
      texture(this.irradianceTexture),
      vec3(screenCoordinate, layer.add(0.5)),
      int(scatteringOrder)
    )
    this.material.fragmentNode = vec4(radiance, 1)
    this.material.additive = false
    this.material.needsUpdate = true

    this.renderToRenderTarget3D(context.deltaScatteringDensity, layer)
  }

  private computeIndirectIrradiance(
    context: Context,
    scatteringOrder: number
  ): void {
    const irradiance = computeIndirectIrradianceTexture(
      this.atmosphere,
      texture3D(context.deltaRayleighScattering.texture),
      texture3D(context.deltaMieScattering.texture),
      texture3D(context.deltaMultipleScattering.texture),
      screenCoordinate,
      int(scatteringOrder - 1)
    )
    this.material.fragmentNode = mrt({
      deltaIrradiance: irradiance,
      irradiance: irradiance.mul(context.luminanceFromRadiance)
    })
    this.material.additive = true
    this.material.needsUpdate = true

    // Turn off blending on the deltaIrradiance.
    this.clearRenderTarget(context.deltaIrradiance)

    this.renderToRenderTarget(this.irradianceRenderTarget, [
      context.deltaIrradiance.texture
    ])
  }

  private computeMultipleScattering(context: Context): void {
    const layer = uniform(0)
    const multipleScattering = computeMultipleScatteringTexture(
      this.atmosphere,
      texture(this.transmittanceTexture),
      texture3D(context.deltaScatteringDensity.texture),
      vec3(screenCoordinate, layer.add(0.5))
    )
    const radiance = multipleScattering.get('radiance')
    const cosTheta = multipleScattering.get('cosTheta')
    this.material.fragmentNode = mrt({
      scattering: vec4(
        radiance
          .mul(context.luminanceFromRadiance)
          .div(rayleighPhaseFunction(cosTheta)),
        0
      ),
      // deltaMultipleScattering is shared with deltaRayleigh.
      deltaRayleigh: vec4(radiance, 1)
    })
    this.material.additive = true
    this.material.needsUpdate = true

    // Turn off blending on the deltaMultipleScattering.
    this.clearRenderTarget3D(context.deltaMultipleScattering)

    this.renderToRenderTarget3D(this.scatteringRenderTarget, layer, [
      context.deltaMultipleScattering.texture
    ])
  }

  private *precompute(context: Context): Iterable<void> {
    this.clearRenderTarget(this.irradianceRenderTarget)
    this.clearRenderTarget3D(this.scatteringRenderTarget)
    this.clearRenderTarget3D(context.deltaRayleighScattering)
    this.clearRenderTarget3D(context.deltaMieScattering)
    this.clearRenderTarget3D(context.deltaScatteringDensity)
    this.clearRenderTarget3D(context.deltaMultipleScattering)

    // Compute the transmittance, and store it in transmittanceTexture.
    this.computeTransmittance()

    // Compute the direct irradiance, store it in deltaIrradiance and,
    // depending on "additive", either initialize irradianceTexture with zeros
    // or leave it unchanged (we don't want the direct irradiance in
    // irradianceTexture, but only the irradiance from the sky).
    this.computeDirectIrradiance(context)
    this.renderer.setRenderTarget(null)
    yield

    // Compute the rayleigh and mie single scattering, store them in
    // deltaRayleighScattering and deltaMieScattering, and either store them or
    // accumulate them in scatteringTexture and optional
    // mieScatteringTexture.
    this.computeSingleScattering(context)
    this.renderer.setRenderTarget(null)
    yield

    // Compute the 2nd, 3rd and 4th order of scattering, in sequence.
    for (let scatteringOrder = 2; scatteringOrder <= 4; ++scatteringOrder) {
      // Compute the scattering density, and store it in deltaScatteringDensity.
      this.computeScatteringDensity(context, scatteringOrder)

      // Compute the indirect irradiance, store it in deltaIrradiance and
      // accumulate it in irradianceTexture.
      this.computeIndirectIrradiance(context, scatteringOrder)

      // Compute the multiple scattering, store it in deltaMultipleScattering,
      // and accumulate it in scatteringTexture.
      this.computeMultipleScattering(context)

      this.renderer.setRenderTarget(null)
      yield
    }
  }

  async update(): Promise<void> {
    const renderer = this.renderer
    const context = new Context(HalfFloatType)
    const autoClear = renderer.autoClear
    renderer.autoClear = false
    context.lambdas.value.set(680, 550, 440)
    context.luminanceFromRadiance.value.identity()
    await iterateIdle(this.precompute(context))
    renderer.autoClear = autoClear
    context.dispose()
  }
}
