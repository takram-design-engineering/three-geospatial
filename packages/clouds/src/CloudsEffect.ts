import { Effect, EffectAttribute, Resolution } from 'postprocessing'
import {
  Camera,
  Matrix4,
  Vector2,
  Vector3,
  type Data3DTexture,
  type DataArrayTexture,
  type DataTexture,
  type DepthPackingStrategies,
  type Event,
  type Texture,
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
import { ShadowPass } from './ShadowPass'
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
      extinctionCoefficient: 0.3,
      detailAmount: 1,
      weatherExponent: 1,
      shapeAlteringBias: 0.35,
      coverageFilterWidth: 0.6,
      shadow: true
    },
    {
      altitude: 1000,
      height: 1200,
      extinctionCoefficient: 0.3,
      detailAmount: 1,
      weatherExponent: 1,
      shapeAlteringBias: 0.35,
      coverageFilterWidth: 0.6,
      shadow: true
    },
    {
      altitude: 7500,
      height: 1500,
      extinctionCoefficient: 0.002,
      detailAmount: 0.8,
      weatherExponent: 1,
      shapeAlteringBias: 0.35,
      coverageFilterWidth: 0.5
    },
    {
      altitude: 0,
      height: 0,
      extinctionCoefficient: 0,
      detailAmount: 0,
      weatherExponent: 1,
      shapeAlteringBias: 0.35,
      coverageFilterWidth: 0
    }
  ]

  // These instances are shared by both cloud and shadow materials.
  readonly ellipsoidCenter = new Vector3()
  readonly ellipsoidMatrix = new Matrix4()
  readonly sunDirection = new Vector3()

  // Atmosphere, weather and shape
  readonly localWeather = new LocalWeather()
  readonly localWeatherVelocity = new Vector2()
  readonly shape = new CloudShape()
  readonly shapeVelocity = new Vector3()
  readonly shapeDetail = new CloudShapeDetail()
  readonly shapeDetailVelocity = new Vector3()

  readonly shadow: CascadedShadowMaps
  readonly shadowPass: ShadowPass
  readonly cloudsPass: CloudsPass

  readonly resolution: Resolution
  private frame = 0
  private readonly shadowMapSize = new Vector2()
  private shadowCascadeCount = 0

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
    this.shadowPass = new ShadowPass(this, atmosphere)
    this.cloudsPass = new CloudsPass(this, atmosphere)

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

    // Initialize aggregated properties.
    this.temporalUpscaling = true
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
    if (
      shadow.cascadeCount !== this.shadowCascadeCount ||
      !shadow.mapSize.equals(this.shadowMapSize)
    ) {
      const { width, height } = shadow.mapSize
      const depth = shadow.cascadeCount
      this.shadowMapSize.set(width, height)
      this.shadowCascadeCount = depth

      this.shadowPass.setSize(width, height, depth)
      this.cloudsPass.setShadowSize(width, height, depth)
    }

    this.localWeather.update(renderer)
    this.shape.update(renderer)
    this.shapeDetail.update(renderer)

    ++this.frame
    const { cloudLayers, frame } = this
    this.cloudsPass.shadowTexture = this.shadowPass.texture
    this.shadowPass.update(renderer, cloudLayers, frame, deltaTime)
    this.cloudsPass.update(renderer, cloudLayers, frame, deltaTime)
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

  get temporalUpscaling(): boolean {
    return this.cloudsPass.temporalUpscaling
  }

  set temporalUpscaling(value: boolean) {
    this.cloudsPass.temporalUpscaling = value
  }

  get crepuscularRays(): boolean {
    return this.cloudsPass.crepuscularRays
  }

  set crepuscularRays(value: boolean) {
    this.cloudsPass.crepuscularRays = value
  }

  // Textures

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
    return this.cloudsPass.texture
  }

  get shadowBuffer(): DataArrayTexture {
    return this.shadowPass.texture
  }

  get shadowIntervals(): Vector2[] {
    return this.cloudsPass.currentMaterial.uniforms.shadowIntervals.value
  }

  get shadowMatrices(): Matrix4[] {
    return this.cloudsPass.currentMaterial.uniforms.shadowMatrices.value
  }

  get shadowTopHeight(): number {
    return this.cloudsPass.currentMaterial.uniforms.shadowTopHeight.value
  }

  get shadowLengthBuffer(): Texture | null {
    return this.cloudsPass.shadowLengthTexture
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
