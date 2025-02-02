import { Effect, EffectAttribute, Resolution } from 'postprocessing'
import {
  Camera,
  Data3DTexture,
  Matrix4,
  Texture,
  Uniform,
  Vector2,
  Vector3,
  type DataArrayTexture,
  type DataTexture,
  type DepthPackingStrategies,
  type Event,
  type TextureDataType,
  type WebGLRenderer,
  type WebGLRenderTarget
} from 'three'

import { AtmosphereParameters } from '@takram/three-atmosphere'
import { type Ellipsoid } from '@takram/three-geospatial'

import { CascadedShadowMaps } from './CascadedShadowMaps'
import { CloudShape } from './CloudShape'
import { CloudShapeDetail } from './CloudShapeDetail'
import { CloudsPass } from './CloudsPass'
import { LocalWeather } from './LocalWeather'
import { Render3DTexture } from './Render3DTexture'
import { RenderTexture } from './RenderTexture'
import { ShadowPass } from './ShadowPass'
import { Turbulence } from './Turbulence'
import { type CloudLayers } from './types'

import fragmentShader from './shaders/cloudsEffect.frag?raw'

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

  readonly cloudsBufferRef: Uniform<Texture>
  readonly shadowBufferRef: Uniform<DataArrayTexture>
  readonly shadowFarRef = new Uniform(0)
  readonly shadowTopHeightRef = new Uniform(0)
  readonly shadowLengthBufferRef: Uniform<Texture | null>

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

    this.cloudsBufferRef = new Uniform(this.cloudsPass.outputBuffer)
    this.shadowBufferRef = new Uniform(this.shadowPass.outputBuffer)
    this.shadowLengthBufferRef = new Uniform(this.cloudsPass.shadowLengthBuffer)

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

  override update(
    renderer: WebGLRenderer,
    inputBuffer: WebGLRenderTarget,
    deltaTime = 0
  ): void {
    const shadow = this.shadow
    const shadowPass = this.shadowPass
    const cloudsPass = this.cloudsPass
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

    this.cloudsBufferRef.value = cloudsPass.outputBuffer
    this.shadowBufferRef.value = shadowPass.outputBuffer
    this.shadowFarRef.value = this.shadowFar
    this.shadowTopHeightRef.value = this.shadowTopHeight
    this.shadowLengthBufferRef.value = cloudsPass.shadowLengthBuffer

    ++this.frame
    const { cloudLayers, frame } = this
    cloudsPass.shadowBuffer = shadowPass.outputBuffer
    shadowPass.update(renderer, cloudLayers, frame, deltaTime)
    cloudsPass.update(renderer, cloudLayers, frame, deltaTime)
  }

  override setSize(baseWidth: number, baseHeight: number): void {
    const resolution = this.resolution
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

  get temporalUpscale(): boolean {
    return this.cloudsPass.temporalUpscale
  }

  set temporalUpscale(value: boolean) {
    this.cloudsPass.temporalUpscale = value
  }

  get crepuscularRays(): boolean {
    return this.cloudsPass.crepuscularRays
  }

  set crepuscularRays(value: boolean) {
    this.cloudsPass.crepuscularRays = value
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

  // Cloud parameters

  get coverage(): number {
    return this.cloudsPass.currentMaterial.uniforms.coverage.value
  }

  set coverage(value: number) {
    this.shadowPass.currentMaterial.uniforms.coverage.value = value
    this.cloudsPass.currentMaterial.uniforms.coverage.value = value
  }

  // Atmosphere composition accessors

  get cloudsBuffer(): Texture {
    return this.cloudsPass.outputBuffer
  }

  get shadowBuffer(): DataArrayTexture {
    return this.shadowPass.outputBuffer
  }

  get shadowIntervals(): Vector2[] {
    return this.cloudsPass.currentMaterial.uniforms.shadowIntervals.value
  }

  get shadowMatrices(): Matrix4[] {
    return this.cloudsPass.currentMaterial.uniforms.shadowMatrices.value
  }

  get shadowFar(): number {
    return this.shadow.far
  }

  get shadowTopHeight(): number {
    return this.cloudsPass.currentMaterial.uniforms.shadowTopHeight.value
  }

  get shadowLengthBuffer(): Texture | null {
    return this.cloudsPass.shadowLengthBuffer
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
