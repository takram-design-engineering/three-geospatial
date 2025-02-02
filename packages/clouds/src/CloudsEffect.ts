import { Effect, EffectAttribute, Resolution } from 'postprocessing'
import {
  Camera,
  Matrix4,
  Vector2,
  Vector3,
  type Data3DTexture,
  type DataTexture,
  type DepthPackingStrategies,
  type Event,
  type Texture,
  type TextureDataType,
  type WebGLRenderer,
  type WebGLRenderTarget
} from 'three'

import {
  AtmosphereParameters,
  type AtmosphereOverlay,
  type AtmosphereShadow,
  type AtmosphereShadowLength
} from '@takram/three-atmosphere'
import { type Ellipsoid } from '@takram/three-geospatial'

import { CascadedShadowMaps } from './CascadedShadowMaps'
import { CloudShape } from './CloudShape'
import { CloudShapeDetail } from './CloudShapeDetail'
import { CloudsPass } from './CloudsPass'
import { LocalWeather } from './LocalWeather'
import { type Render3DTexture } from './Render3DTexture'
import { type RenderTexture } from './RenderTexture'
import { ShadowPass } from './ShadowPass'
import { Turbulence } from './Turbulence'
import { type CloudLayers } from './types'

import fragmentShader from './shaders/cloudsEffect.frag?raw'

export interface CloudsEffectChangeEvent {
  type: 'change'
  target: CloudsEffect
  property: 'atmosphereOverlay' | 'atmosphereShadow' | 'atmosphereShadowLength'
}

export interface CloudsEffectOptions {
  resolutionScale?: number
  width?: number
  height?: number
  resolutionX?: number
  resolutionY?: number
}

export const cloudsEffectOptionsDefaults = {
  resolutionScale: 1,
  width: Resolution.AUTO_SIZE,
  height: Resolution.AUTO_SIZE
} satisfies CloudsEffectOptions

export class CloudsEffect extends Effect {
  readonly cloudLayers: CloudLayers = [
    {
      altitude: 750,
      height: 650,
      densityScale: 0.3,
      shapeAmount: 1,
      detailAmount: 1,
      weatherExponent: 1,
      shapeAlteringBias: 0.35,
      coverageFilterWidth: 0.6,
      shadow: true
    },
    {
      altitude: 1000,
      height: 1200,
      densityScale: 0.3,
      shapeAmount: 1,
      detailAmount: 1,
      weatherExponent: 1,
      shapeAlteringBias: 0.35,
      coverageFilterWidth: 0.6,
      shadow: true
    },
    {
      altitude: 7500,
      height: 500,
      densityScale: 0.005,
      shapeAmount: 0.4,
      detailAmount: 0,
      weatherExponent: 1,
      shapeAlteringBias: 0.35,
      coverageFilterWidth: 0.5
    },
    {
      altitude: 0,
      height: 0,
      densityScale: 0,
      shapeAmount: 0,
      detailAmount: 0,
      weatherExponent: 0,
      shapeAlteringBias: 0,
      coverageFilterWidth: 0
    }
  ]

  // These instances are shared by both cloud and shadow materials.
  readonly ellipsoidCenter = new Vector3()
  readonly ellipsoidMatrix = new Matrix4()
  readonly sunDirection = new Vector3()

  // Weather and shape
  localWeather: RenderTexture = new LocalWeather()
  readonly localWeatherVelocity = new Vector2()
  shape: Render3DTexture = new CloudShape()
  readonly shapeVelocity = new Vector3()
  shapeDetail: Render3DTexture = new CloudShapeDetail()
  readonly shapeDetailVelocity = new Vector3()
  turbulence: RenderTexture = new Turbulence()

  readonly shadow: CascadedShadowMaps
  readonly shadowPass: ShadowPass
  readonly cloudsPass: CloudsPass

  private _atmosphereOverlay: AtmosphereOverlay | null = null
  private _atmosphereShadow: AtmosphereShadow | null = null
  private _atmosphereShadowLength: AtmosphereShadowLength | null = null

  readonly resolution: Resolution
  private frame = 0
  private shadowCascadeCount = 0
  private readonly shadowMapSize = new Vector2()

  constructor(
    private camera: Camera = new Camera(),
    options?: CloudsEffectOptions,
    private readonly atmosphere = AtmosphereParameters.DEFAULT
  ) {
    super('CloudsEffect', fragmentShader, {
      attributes: EffectAttribute.DEPTH
    })

    const {
      resolutionScale,
      width,
      height,
      resolutionX = width,
      resolutionY = height
    } = {
      ...cloudsEffectOptionsDefaults,
      ...options
    }

    this.shadow = new CascadedShadowMaps({
      cascadeCount: 3,
      mapSize: new Vector2().setScalar(512),
      splitLambda: 0.6
    })

    const passOptions = {
      ellipsoidCenter: this.ellipsoidCenter,
      ellipsoidMatrix: this.ellipsoidMatrix,
      sunDirection: this.sunDirection,
      localWeatherVelocity: this.localWeatherVelocity,
      shapeVelocity: this.shapeVelocity,
      shapeDetailVelocity: this.shapeDetailVelocity,
      shadow: this.shadow
    }
    this.shadowPass = new ShadowPass(passOptions, atmosphere)
    this.cloudsPass = new CloudsPass(passOptions, atmosphere)

    const textures = {
      localWeatherTexture: this.localWeather.texture,
      shapeTexture: this.shape.texture,
      shapeDetailTexture: this.shapeDetail.texture,
      turbulenceTexture: this.turbulence.texture
    }
    Object.assign(this.shadowPass, textures)
    Object.assign(this.cloudsPass, textures)

    this.resolution = new Resolution(
      this,
      resolutionX,
      resolutionY,
      resolutionScale
    )
    this.resolution.addEventListener<keyof Event>(
      'change' as keyof Event,
      this.onResolutionChange
    )
  }

  private readonly onResolutionChange = (): void => {
    this.setSize(this.resolution.baseWidth, this.resolution.baseHeight)
  }

  get mainCamera(): Camera {
    return this.camera
  }

  override set mainCamera(value: Camera) {
    this.camera = value
    this.shadowPass.mainCamera = value
    this.cloudsPass.mainCamera = value
  }

  override initialize(
    renderer: WebGLRenderer,
    alpha: boolean,
    frameBufferType: TextureDataType
  ): void {
    this.shadowPass.initialize(renderer, alpha, frameBufferType)
    this.cloudsPass.initialize(renderer, alpha, frameBufferType)
  }

  private updateAtmosphereComposition(): void {
    const { shadow, shadowPass, cloudsPass } = this
    const cloudsUniforms = cloudsPass.currentMaterial.uniforms

    // The postprocessing Effect class incorrectly specifies the event map:
    //   class Effect extends EventDispatcher<import("three").Event>
    // This expects events of type "type" and "target," which conflicts with the
    // EventDispatcher's type constraints and prevents dispatching events
    // without type errors.

    const prevOverlay = this._atmosphereOverlay
    const nextOverlay = Object.assign(this._atmosphereOverlay ?? {}, {
      map: cloudsPass.outputBuffer
    })
    if (prevOverlay !== nextOverlay) {
      this._atmosphereOverlay = nextOverlay
      ;(this.dispatchEvent as (event: CloudsEffectChangeEvent) => void)({
        type: 'change',
        target: this,
        property: 'atmosphereOverlay'
      })
    }

    const prevShadow = this._atmosphereShadow
    const nextShadow = Object.assign(this._atmosphereShadow ?? {}, {
      map: shadowPass.outputBuffer,
      mapSize: shadow.mapSize,
      cascadeCount: shadow.cascadeCount,
      intervals: cloudsUniforms.shadowIntervals.value,
      matrices: cloudsUniforms.shadowMatrices.value,
      far: shadow.far,
      topHeight: cloudsUniforms.shadowTopHeight.value
    })
    if (prevShadow !== nextShadow) {
      this._atmosphereShadow = nextShadow
      ;(this.dispatchEvent as (event: CloudsEffectChangeEvent) => void)({
        type: 'change',
        target: this,
        property: 'atmosphereShadow'
      })
    }

    const prevShadowLength = this._atmosphereShadowLength
    const nextShadowLength =
      cloudsPass.shadowLengthBuffer != null
        ? Object.assign(this._atmosphereShadowLength ?? {}, {
            map: cloudsPass.shadowLengthBuffer
          })
        : null
    if (prevShadowLength !== nextShadowLength) {
      this._atmosphereShadowLength = nextShadowLength
      ;(this.dispatchEvent as (event: CloudsEffectChangeEvent) => void)({
        type: 'change',
        target: this,
        property: 'atmosphereShadowLength'
      })
    }
  }

  override update(
    renderer: WebGLRenderer,
    inputBuffer: WebGLRenderTarget,
    deltaTime = 0
  ): void {
    const { shadow, shadowPass, cloudsPass } = this
    if (
      shadow.cascadeCount !== this.shadowCascadeCount ||
      !shadow.mapSize.equals(this.shadowMapSize)
    ) {
      const { width, height } = shadow.mapSize
      const depth = shadow.cascadeCount
      this.shadowMapSize.set(width, height)
      this.shadowCascadeCount = depth

      shadowPass.setSize(width, height, depth)
      cloudsPass.setShadowSize(width, height, depth)
    }

    if ('update' in this.localWeather) {
      this.localWeather.update(renderer, deltaTime)
    }
    if ('update' in this.shape) {
      this.shape.update(renderer, deltaTime)
    }
    if ('update' in this.shapeDetail) {
      this.shapeDetail.update(renderer, deltaTime)
    }
    if ('update' in this.turbulence) {
      this.turbulence.update(renderer, deltaTime)
    }

    ++this.frame
    const { cloudLayers, frame } = this
    shadowPass.update(renderer, cloudLayers, frame, deltaTime)
    cloudsPass.shadowBuffer = shadowPass.outputBuffer
    cloudsPass.update(renderer, cloudLayers, frame, deltaTime)

    this.updateAtmosphereComposition()
  }

  override setSize(baseWidth: number, baseHeight: number): void {
    const { resolution } = this
    resolution.setBaseSize(baseWidth, baseHeight)
    const { width, height } = resolution
    this.cloudsPass.setSize(width, height)
  }

  override setDepthTexture(
    depthTexture: Texture,
    depthPacking?: DepthPackingStrategies
  ): void {
    this.shadowPass.setDepthTexture(depthTexture, depthPacking)
    this.cloudsPass.setDepthTexture(depthTexture, depthPacking)
  }

  // Textures

  get localWeatherTexture(): Texture | null {
    return this.cloudsPass.localWeatherTexture
  }

  set localWeatherTexture(value: Texture | null) {
    this.cloudsPass.localWeatherTexture = value
    this.shadowPass.localWeatherTexture = value
  }

  get shapeTexture(): Data3DTexture | null {
    return this.cloudsPass.shapeTexture
  }

  set shapeTexture(value: Data3DTexture | null) {
    this.cloudsPass.shapeTexture = value
    this.shadowPass.shapeTexture = value
  }

  get shapeDetailTexture(): Data3DTexture | null {
    return this.cloudsPass.shapeDetailTexture
  }

  set shapeDetailTexture(value: Data3DTexture | null) {
    this.cloudsPass.shapeDetailTexture = value
    this.shadowPass.shapeDetailTexture = value
  }

  get turbulenceTexture(): Texture | null {
    return this.cloudsPass.turbulenceTexture
  }

  set turbulenceTexture(value: Texture | null) {
    this.cloudsPass.turbulenceTexture = value
    this.shadowPass.turbulenceTexture = value
  }

  get stbnTexture(): Data3DTexture | null {
    return this.cloudsPass.currentMaterial.uniforms.stbnTexture.value
  }

  set stbnTexture(value: Data3DTexture | null) {
    this.shadowPass.currentMaterial.uniforms.stbnTexture.value = value
    this.cloudsPass.currentMaterial.uniforms.stbnTexture.value = value
  }

  // Pass parameters

  get temporalUpscale(): boolean {
    return this.cloudsPass.temporalUpscale
  }

  set temporalUpscale(value: boolean) {
    this.cloudsPass.temporalUpscale = value
  }

  get lightShafts(): boolean {
    return this.cloudsPass.lightShafts
  }

  set lightShafts(value: boolean) {
    this.cloudsPass.lightShafts = value
  }

  // Cloud parameters

  get coverage(): number {
    return this.cloudsPass.currentMaterial.uniforms.coverage.value
  }

  set coverage(value: number) {
    this.shadowPass.currentMaterial.uniforms.coverage.value = value
    this.cloudsPass.currentMaterial.uniforms.coverage.value = value
  }

  // Atmosphere composition

  get atmosphereOverlay(): AtmosphereOverlay | null {
    return this._atmosphereOverlay
  }

  get atmosphereShadow(): AtmosphereShadow | null {
    return this._atmosphereShadow
  }

  get atmosphereShadowLength(): AtmosphereShadowLength | null {
    return this._atmosphereShadowLength
  }

  // Atmosphere parameters

  get irradianceTexture(): DataTexture | null {
    return this.cloudsPass.currentMaterial.irradianceTexture
  }

  set irradianceTexture(value: DataTexture | null) {
    this.cloudsPass.currentMaterial.irradianceTexture = value
  }

  get scatteringTexture(): Data3DTexture | null {
    return this.cloudsPass.currentMaterial.scatteringTexture
  }

  set scatteringTexture(value: Data3DTexture | null) {
    this.cloudsPass.currentMaterial.scatteringTexture = value
  }

  get transmittanceTexture(): DataTexture | null {
    return this.cloudsPass.currentMaterial.transmittanceTexture
  }

  set transmittanceTexture(value: DataTexture | null) {
    this.cloudsPass.currentMaterial.transmittanceTexture = value
  }

  get useHalfFloat(): boolean {
    return this.cloudsPass.currentMaterial.useHalfFloat
  }

  set useHalfFloat(value: boolean) {
    this.cloudsPass.currentMaterial.useHalfFloat = value
  }

  get ellipsoid(): Ellipsoid {
    return this.cloudsPass.currentMaterial.ellipsoid
  }

  set ellipsoid(value: Ellipsoid) {
    this.cloudsPass.currentMaterial.ellipsoid = value
    this.shadowPass.currentMaterial.ellipsoid = value
  }

  get correctAltitude(): boolean {
    return this.cloudsPass.currentMaterial.correctAltitude
  }

  set correctAltitude(value: boolean) {
    this.cloudsPass.currentMaterial.correctAltitude = value
    this.shadowPass.currentMaterial.correctAltitude = value
  }

  get photometric(): boolean {
    return this.cloudsPass.currentMaterial.photometric
  }

  set photometric(value: boolean) {
    this.cloudsPass.currentMaterial.photometric = value
  }

  get sunAngularRadius(): number {
    return this.cloudsPass.currentMaterial.sunAngularRadius
  }

  set sunAngularRadius(value: number) {
    this.cloudsPass.currentMaterial.sunAngularRadius = value
  }
}
