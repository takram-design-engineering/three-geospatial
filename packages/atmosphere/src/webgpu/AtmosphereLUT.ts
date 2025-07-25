import {
  AddEquation,
  Box3,
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
  Vector3,
  type Texture
} from 'three'
import {
  exp,
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
  type Node,
  type Renderer,
  type UniformNode
} from 'three/webgpu'

import {
  isFloatLinearSupported,
  type AnyFloatType
} from '@takram/three-geospatial'

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
import { AtmosphereParams, type Options } from './definitions'
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

const scatteringTextureRegion = /*#__PURE__#*/ new Box3(
  /*#__PURE__#*/ new Vector3(),
  /*#__PURE__#*/ new Vector3(
    SCATTERING_TEXTURE_WIDTH,
    SCATTERING_TEXTURE_HEIGHT,
    SCATTERING_TEXTURE_DEPTH
  )
)

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
  options: Options

  constructor(textureType: AnyFloatType) {
    if (textureType === HalfFloatType) {
      this.opticalDepth = createRenderTarget(
        textureType,
        TRANSMITTANCE_TEXTURE_WIDTH,
        TRANSMITTANCE_TEXTURE_HEIGHT,
        'opticalDepth'
      )
    }
    this.deltaIrradiance = createRenderTarget(
      textureType,
      IRRADIANCE_TEXTURE_WIDTH,
      IRRADIANCE_TEXTURE_HEIGHT,
      'deltaIrradiance'
    )
    this.deltaRayleighScattering = createRenderTarget3D(
      textureType,
      SCATTERING_TEXTURE_WIDTH,
      SCATTERING_TEXTURE_HEIGHT,
      SCATTERING_TEXTURE_DEPTH,
      'deltaRayleighScattering'
    )
    this.deltaMieScattering = createRenderTarget3D(
      textureType,
      SCATTERING_TEXTURE_WIDTH,
      SCATTERING_TEXTURE_HEIGHT,
      SCATTERING_TEXTURE_DEPTH,
      'deltaMieScattering'
    )
    this.deltaScatteringDensity = createRenderTarget3D(
      textureType,
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

    this.options = {
      transmittancePrecisionLog: this.opticalDepth != null
    }
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
  private readonly transmittanceRenderTarget: RenderTarget
  private readonly irradianceRenderTarget: RenderTarget
  private readonly scatteringRenderTarget: RenderTarget3D
  readonly singleMieScatteringTexture?: Data3DTexture
  private readonly higherOrderScatteringRenderTarget?: RenderTarget3D

  private readonly renderer: Renderer
  private readonly textureType: AnyFloatType
  private readonly atmosphere = new AtmosphereParams()
  private readonly material = new AdditiveNodeMaterial()
  private readonly mesh = new QuadMesh(this.material)

  private updating = false
  private disposeQueue: (() => void) | undefined

  get transmittanceTexture(): Texture {
    return this.transmittanceRenderTarget.texture
  }

  get irradianceTexture(): Texture {
    return this.irradianceRenderTarget.texture
  }

  get scatteringTexture(): Texture {
    return this.scatteringRenderTarget.texture
  }

  get higherOrderScatteringTexture(): Texture | undefined {
    return this.higherOrderScatteringRenderTarget?.texture
  }

  constructor(
    renderer: Renderer,
    {
      textureType = isFloatLinearSupported(renderer)
        ? FloatType
        : HalfFloatType,
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
    this.irradianceRenderTarget = createRenderTarget(
      textureType,
      IRRADIANCE_TEXTURE_WIDTH,
      IRRADIANCE_TEXTURE_HEIGHT,
      'irradiance'
    )
    this.scatteringRenderTarget = createRenderTarget3D(
      textureType,
      SCATTERING_TEXTURE_WIDTH,
      SCATTERING_TEXTURE_HEIGHT,
      SCATTERING_TEXTURE_DEPTH,
      'scattering'
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
      this.higherOrderScatteringRenderTarget = createRenderTarget3D(
        textureType,
        SCATTERING_TEXTURE_WIDTH,
        SCATTERING_TEXTURE_HEIGHT,
        SCATTERING_TEXTURE_DEPTH,
        'higherOrderScattering'
      )
    }
  }

  private clearRenderTarget(renderTarget?: RenderTarget): void {
    if (renderTarget == null) {
      return
    }
    if (renderTarget instanceof RenderTarget3D) {
      for (let i = 0; i < renderTarget.depth; ++i) {
        this.renderer.setRenderTarget(renderTarget, i)
        void this.renderer.clearColor()
      }
    } else {
      this.renderer.setRenderTarget(renderTarget)
      void this.renderer.clearColor()
    }
  }

  private renderToRenderTarget(
    renderTarget: RenderTarget,
    textures?: readonly Texture[]
  ): void {
    if (textures != null) {
      renderTarget.textures.push(...textures)
    }
    this.renderer.setRenderTarget(renderTarget)
    this.mesh.render(this.renderer)
    renderTarget.textures.length = 1
  }

  private renderToRenderTarget3D(
    renderTarget: RenderTarget3D,
    layer: UniformNode<number>,
    textures?: readonly Data3DTexture[]
  ): void {
    if (textures != null) {
      renderTarget.textures.push(...textures)
    }
    for (let i = 0; i < renderTarget.depth; ++i) {
      layer.value = i
      this.renderer.setRenderTarget(renderTarget, i)
      this.mesh.render(this.renderer)
    }
    renderTarget.textures.length = 1
  }

  private computeTransmittance({ opticalDepth, options }: Context): void {
    const result = computeTransmittanceToTopAtmosphereBoundaryTexture(
      this.atmosphere,
      screenCoordinate,
      options
    ).toVar()

    if (options.transmittancePrecisionLog === true) {
      // Compute the optical depth, and store it in opticalDepth. Avoid having
      // tiny transmittance values underflow to 0 due to half-float precision.
      this.material.fragmentNode = mrt({
        transmittance: exp(result.negate()),
        opticalDepth: result
      })
    } else {
      this.material.fragmentNode = result
    }
    this.material.additive = false
    this.material.needsUpdate = true

    this.renderToRenderTarget(
      this.transmittanceRenderTarget,
      [opticalDepth?.texture].filter(value => value != null)
    )
  }

  private computeDirectIrradiance({
    deltaIrradiance,
    opticalDepth,
    options
  }: Context): void {
    const irradiance = computeDirectIrradianceTexture(
      this.atmosphere,
      texture(opticalDepth?.texture ?? this.transmittanceTexture),
      screenCoordinate,
      options
    )

    this.material.fragmentNode = mrt({
      deltaIrradiance: vec4(irradiance, 1),
      irradiance: vec4(vec3(0), 1)
    })
    this.material.additive = true
    this.material.needsUpdate = true

    // Turn off blending on the deltaIrradiance.
    this.clearRenderTarget(deltaIrradiance)

    this.renderToRenderTarget(this.irradianceRenderTarget, [
      deltaIrradiance.texture
    ])
  }

  private computeSingleScattering({
    luminanceFromRadiance,
    deltaRayleighScattering,
    deltaMieScattering,
    opticalDepth,
    options
  }: Context): void {
    const layer = uniform(0)
    const singleScattering = computeSingleScatteringTexture(
      this.atmosphere,
      texture(opticalDepth?.texture ?? this.transmittanceTexture),
      vec3(screenCoordinate, layer.add(0.5)),
      options
    ).toVar()
    const rayleigh = singleScattering.get('rayleigh')
    const mie = singleScattering.get('mie')

    this.material.fragmentNode = mrt({
      scattering: vec4(rayleigh.rgb, mie.r).mul(luminanceFromRadiance),
      deltaRayleighScattering: vec4(rayleigh.rgb, 1),
      deltaMieScattering: vec4(mie.rgb, 1)
    })
    this.material.additive = true
    this.material.needsUpdate = true

    // Turn off blending on the deltaRayleighScattering and deltaMieScattering.
    this.clearRenderTarget(deltaRayleighScattering)
    this.clearRenderTarget(deltaMieScattering)

    this.renderToRenderTarget3D(this.scatteringRenderTarget, layer, [
      deltaRayleighScattering.texture,
      deltaMieScattering.texture
    ])

    if (this.singleMieScatteringTexture != null) {
      this.renderer.copyTextureToTexture(
        deltaMieScattering.texture,
        this.singleMieScatteringTexture,
        scatteringTextureRegion
      )
    }
  }

  private computeScatteringDensity(
    {
      deltaIrradiance,
      deltaRayleighScattering,
      deltaMieScattering,
      deltaScatteringDensity,
      deltaMultipleScattering,
      opticalDepth,
      options
    }: Context,
    scatteringOrder: number
  ): void {
    const layer = uniform(0)
    const radiance = computeScatteringDensityTexture(
      this.atmosphere,
      texture(opticalDepth?.texture ?? this.transmittanceTexture),
      texture3D(deltaRayleighScattering.texture),
      texture3D(deltaMieScattering.texture),
      texture3D(deltaMultipleScattering.texture),
      texture(deltaIrradiance.texture),
      vec3(screenCoordinate, layer.add(0.5)),
      int(scatteringOrder),
      options
    )

    this.material.fragmentNode = vec4(radiance, 1)
    this.material.additive = false
    this.material.needsUpdate = true

    this.renderToRenderTarget3D(deltaScatteringDensity, layer)
  }

  private computeIndirectIrradiance(
    {
      luminanceFromRadiance,
      deltaIrradiance,
      deltaRayleighScattering,
      deltaMieScattering,
      deltaMultipleScattering
    }: Context,
    scatteringOrder: number
  ): void {
    const irradiance = computeIndirectIrradianceTexture(
      this.atmosphere,
      texture3D(deltaRayleighScattering.texture),
      texture3D(deltaMieScattering.texture),
      texture3D(deltaMultipleScattering.texture),
      screenCoordinate,
      int(scatteringOrder - 1)
    ).toVar()

    this.material.fragmentNode = mrt({
      deltaIrradiance: irradiance,
      irradiance: irradiance.mul(luminanceFromRadiance)
    })
    this.material.additive = true
    this.material.needsUpdate = true

    // Turn off blending on the deltaIrradiance.
    this.clearRenderTarget(deltaIrradiance)

    this.renderToRenderTarget(this.irradianceRenderTarget, [
      deltaIrradiance.texture
    ])
  }

  private computeMultipleScattering({
    luminanceFromRadiance,
    deltaScatteringDensity,
    deltaMultipleScattering,
    opticalDepth,
    options
  }: Context): void {
    const layer = uniform(0)
    const multipleScattering = computeMultipleScatteringTexture(
      this.atmosphere,
      texture(opticalDepth?.texture ?? this.transmittanceTexture),
      texture3D(deltaScatteringDensity.texture),
      vec3(screenCoordinate, layer.add(0.5)),
      options
    ).toVar()
    const radiance = multipleScattering.get('radiance')
    const cosTheta = multipleScattering.get('cosTheta')
    const luminance = radiance
      .mul(luminanceFromRadiance)
      .div(rayleighPhaseFunction(cosTheta))
      .toVar()

    const mrtLayout: Record<string, Node> = {
      scattering: vec4(luminance, 0),
      // deltaMultipleScattering is shared with deltaRayleighScattering.
      deltaRayleighScattering: vec4(radiance, 1)
    }
    if (this.higherOrderScatteringRenderTarget != null) {
      mrtLayout.higherOrderScattering = vec4(luminance, 1)
    }
    this.material.fragmentNode = mrt(mrtLayout)
    this.material.additive = true
    this.material.needsUpdate = true

    // Turn off blending on the deltaMultipleScattering.
    this.clearRenderTarget(deltaMultipleScattering)

    this.renderToRenderTarget3D(
      this.scatteringRenderTarget,
      layer,
      [
        deltaMultipleScattering.texture,
        this.higherOrderScatteringRenderTarget?.texture
      ].filter(value => value != null)
    )
  }

  private *precompute(context: Context): Iterable<void> {
    this.clearRenderTarget(this.transmittanceRenderTarget)
    this.clearRenderTarget(this.irradianceRenderTarget)
    this.clearRenderTarget(this.scatteringRenderTarget)
    this.clearRenderTarget(this.higherOrderScatteringRenderTarget)
    this.clearRenderTarget(context.opticalDepth)
    this.clearRenderTarget(context.deltaRayleighScattering)
    this.clearRenderTarget(context.deltaMieScattering)
    this.clearRenderTarget(context.deltaScatteringDensity)
    this.clearRenderTarget(context.deltaMultipleScattering)

    // Compute the transmittance, and store it in transmittanceTexture.
    this.computeTransmittance(context)

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
    this.updating = true

    const renderer = this.renderer
    const context = new Context(this.textureType)
    const autoClear = renderer.autoClear
    renderer.autoClear = false
    context.lambdas.value.set(680, 550, 440)
    context.luminanceFromRadiance.value.identity()
    await iterateIdle(this.precompute(context))
    renderer.autoClear = autoClear
    context.dispose()

    this.updating = false
    this.disposeQueue?.()
  }

  dispose(options: { textures?: boolean } = {}): void {
    if (this.updating) {
      this.disposeQueue = () => {
        this.dispose(options)
        this.disposeQueue = undefined
      }
      return
    }

    const { textures: disposeTextures = true } = options
    if (!disposeTextures) {
      this.transmittanceRenderTarget.textures.splice(0, 1)
      this.irradianceRenderTarget.textures.splice(0, 1)
      this.scatteringRenderTarget.textures.splice(0, 1)
      this.higherOrderScatteringRenderTarget?.textures.splice(0, 1)
    } else {
      this.singleMieScatteringTexture?.dispose()
    }

    this.transmittanceRenderTarget.dispose()
    this.irradianceRenderTarget.dispose()
    this.scatteringRenderTarget.dispose()
    this.higherOrderScatteringRenderTarget?.dispose()
    this.material.dispose()
    this.mesh.geometry.dispose()
  }
}
