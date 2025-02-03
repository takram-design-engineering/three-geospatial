import { Pass, Resolution } from 'postprocessing'
import {
  Camera,
  EventDispatcher,
  Matrix4,
  Vector2,
  Vector3,
  type Data3DTexture,
  type DataTexture,
  type DepthPackingStrategies,
  type Event,
  type PerspectiveCamera,
  type Texture,
  type TextureDataType,
  type WebGLRenderer,
  type WebGLRenderTarget
} from 'three'

import {
  AtmosphereParameters,
  getAltitudeCorrectionOffset,
  type AtmosphereOverlay,
  type AtmosphereShadow,
  type AtmosphereShadowLength
} from '@takram/three-atmosphere'
import { lerp, type Ellipsoid } from '@takram/three-geospatial'

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
import {
  createAtmosphereUniforms,
  createCloudLayerUniforms,
  createCloudParameterUniforms,
  updateCloudLayerUniforms,
  type AtmosphereUniforms,
  type CloudLayerUniforms,
  type CloudParameterUniforms
} from './uniforms'

const vectorScratch = /*#__PURE__*/ new Vector3()

export function applyVelocity(
  velocity: Vector2 | Vector3,
  deltaTime: number,
  ...results: Array<Vector2 | Vector3>
): void {
  const delta = vectorScratch
    .fromArray(velocity.toArray())
    .multiplyScalar(deltaTime)
  for (let i = 0; i < results.length; ++i) {
    results[i].add(delta)
  }
}

export interface CloudsCompositePassChangeEvent {
  type: 'change'
  target: CloudsCompositePass
  property: 'atmosphereOverlay' | 'atmosphereShadow' | 'atmosphereShadowLength'
}

export interface CloudsCompositePassOptions {
  resolutionScale?: number
  width?: number
  height?: number
  resolutionX?: number
  resolutionY?: number
}

export const cloudsCompositePassOptionsDefaults = {
  resolutionScale: 1,
  width: Resolution.AUTO_SIZE,
  height: Resolution.AUTO_SIZE
} satisfies CloudsCompositePassOptions

export class CloudsCompositePass extends Pass {
  readonly cloudLayers: CloudLayers = [
    {
      altitude: 750,
      height: 650,
      densityScale: 0.15,
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
      densityScale: 0.15,
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
      densityScale: 0.003,
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

  // Weather and shape texture generators
  localWeather: RenderTexture = new LocalWeather()
  shape: Render3DTexture = new CloudShape()
  shapeDetail: Render3DTexture = new CloudShapeDetail()
  turbulence: RenderTexture = new Turbulence()

  correctAltitude = true

  // Mutable instances of cloud parameter uniforms
  readonly localWeatherRepeat = new Vector2().setScalar(100)
  readonly localWeatherOffset = new Vector2()
  readonly shapeRepeat = new Vector3().setScalar(0.0003)
  readonly shapeOffset = new Vector3()
  readonly shapeDetailRepeat = new Vector3().setScalar(0.006)
  readonly shapeDetailOffset = new Vector3()
  readonly turbulenceRepeat = new Vector2().setScalar(20)

  // Mutable instances of atmosphere parameter uniforms
  readonly ellipsoidCenter = new Vector3()
  readonly ellipsoidMatrix = new Matrix4()
  private readonly inverseEllipsoidMatrix = new Matrix4()
  private readonly altitudeCorrection = new Vector3()
  readonly sunDirection = new Vector3()

  // Uniforms shared by both cloud and shadow materials
  private readonly cloudParameterUniforms: CloudParameterUniforms
  private readonly cloudLayerUniforms: CloudLayerUniforms
  private readonly atmosphereUniforms: AtmosphereUniforms

  readonly localWeatherVelocity = new Vector2()
  readonly shapeVelocity = new Vector3()
  readonly shapeDetailVelocity = new Vector3()

  readonly shadow: CascadedShadowMaps
  readonly shadowPass: ShadowPass
  readonly cloudsPass: CloudsPass

  private _atmosphereOverlay: AtmosphereOverlay | null = null
  private _atmosphereShadow: AtmosphereShadow | null = null
  private _atmosphereShadowLength: AtmosphereShadowLength | null = null

  readonly resolution: Resolution
  readonly events = new EventDispatcher<{
    change: CloudsCompositePassChangeEvent
  }>()

  private frame = 0
  private shadowCascadeCount = 0
  private readonly shadowMapSize = new Vector2()

  constructor(
    private _mainCamera: Camera = new Camera(),
    options?: CloudsCompositePassOptions,
    private readonly atmosphere = AtmosphereParameters.DEFAULT
  ) {
    super('CloudsCompositePass')
    this.renderToScreen = false
    this.needsSwap = false
    this.needsDepthTexture = true

    const {
      resolutionScale,
      width,
      height,
      resolutionX = width,
      resolutionY = height
    } = {
      ...cloudsCompositePassOptionsDefaults,
      ...options
    }

    this.shadow = new CascadedShadowMaps({
      cascadeCount: 3,
      mapSize: new Vector2().setScalar(512),
      splitLambda: 0.6
    })

    this.cloudParameterUniforms = createCloudParameterUniforms({
      localWeatherTexture: this.localWeather.texture,
      localWeatherRepeat: this.localWeatherRepeat,
      localWeatherOffset: this.localWeatherOffset,
      shapeTexture: this.shape.texture,
      shapeRepeat: this.shapeRepeat,
      shapeOffset: this.shapeOffset,
      shapeDetailTexture: this.shapeDetail.texture,
      shapeDetailRepeat: this.shapeDetailRepeat,
      shapeDetailOffset: this.shapeDetailOffset,
      turbulenceTexture: this.turbulence.texture,
      turbulenceRepeat: this.turbulenceRepeat
    })

    this.cloudLayerUniforms = createCloudLayerUniforms()

    this.atmosphereUniforms = createAtmosphereUniforms(atmosphere, {
      ellipsoidCenter: this.ellipsoidCenter,
      ellipsoidMatrix: this.ellipsoidMatrix,
      inverseEllipsoidMatrix: this.inverseEllipsoidMatrix,
      altitudeCorrection: this.altitudeCorrection,
      sunDirection: this.sunDirection
    })

    const passOptions = {
      shadow: this.shadow,
      cloudParameterUniforms: this.cloudParameterUniforms,
      cloudLayerUniforms: this.cloudLayerUniforms,
      atmosphereUniforms: this.atmosphereUniforms
    }
    this.shadowPass = new ShadowPass(passOptions)
    this.cloudsPass = new CloudsPass(passOptions, atmosphere)

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

  dispose(): void {
    this.localWeather.dispose()
    this.shape.dispose()
    this.shapeDetail.dispose()
    this.turbulence.dispose()
    super.dispose()
  }

  private readonly onResolutionChange = (): void => {
    this.setSize(this.resolution.baseWidth, this.resolution.baseHeight)
  }

  get mainCamera(): Camera {
    return this._mainCamera
  }

  override set mainCamera(value: Camera) {
    this._mainCamera = value
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

  private updateSharedUniforms(deltaTime: number): void {
    updateCloudLayerUniforms(this.cloudLayerUniforms, this.cloudLayers)

    // Apply velocity to offset uniforms.
    const { cloudParameterUniforms } = this
    applyVelocity(
      this.localWeatherVelocity,
      deltaTime,
      cloudParameterUniforms.localWeatherOffset.value
    )
    applyVelocity(
      this.shapeVelocity,
      deltaTime,
      cloudParameterUniforms.shapeOffset.value
    )
    applyVelocity(
      this.shapeDetailVelocity,
      deltaTime,
      cloudParameterUniforms.shapeDetailOffset.value
    )

    // Update atmosphere uniforms.
    const inverseEllipsoidMatrix = this.inverseEllipsoidMatrix
      .copy(this.ellipsoidMatrix)
      .invert()
    const cameraPositionECEF = this.mainCamera
      .getWorldPosition(vectorScratch)
      .applyMatrix4(inverseEllipsoidMatrix)
      .sub(this.ellipsoidCenter)

    const altitudeCorrection = this.altitudeCorrection
    if (this.correctAltitude) {
      getAltitudeCorrectionOffset(
        cameraPositionECEF,
        this.atmosphere.bottomRadius,
        this.ellipsoid,
        altitudeCorrection,
        false
      )
    } else {
      altitudeCorrection.setScalar(0)
    }

    // TODO: Position the sun on the top atmosphere sphere.
    // Increase light's distance to the target when the sun is at the horizon.
    const surfaceNormal = this.ellipsoid.getSurfaceNormal(
      cameraPositionECEF,
      vectorScratch
    )
    const zenithAngle = this.sunDirection.dot(surfaceNormal)
    const distance = lerp(1e6, 1e3, zenithAngle)

    this.shadow.update(
      this.mainCamera as PerspectiveCamera,
      // The sun direction must be rotated with the ellipsoid to ensure the
      // frusta are constructed correctly. Note this affects the transformation
      // in the shadow shader.
      vectorScratch.copy(this.sunDirection).applyMatrix4(this.ellipsoidMatrix),
      distance
    )
  }

  private updateAtmosphereComposition(): void {
    const { shadow, shadowPass, cloudsPass } = this
    const shadowUniforms = shadowPass.currentMaterial.uniforms
    const cloudsUniforms = cloudsPass.currentMaterial.uniforms

    const prevOverlay = this._atmosphereOverlay
    const nextOverlay = Object.assign(this._atmosphereOverlay ?? {}, {
      map: cloudsPass.outputBuffer
    } satisfies AtmosphereOverlay)
    if (prevOverlay !== nextOverlay) {
      this._atmosphereOverlay = nextOverlay
      this.events.dispatchEvent({
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
      inverseMatrices: shadowUniforms.inverseShadowMatrices.value,
      far: shadow.far,
      topHeight: cloudsUniforms.shadowTopHeight.value
    } satisfies AtmosphereShadow)
    if (prevShadow !== nextShadow) {
      this._atmosphereShadow = nextShadow
      this.events.dispatchEvent({
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
          } satisfies AtmosphereShadowLength)
        : null
    if (prevShadowLength !== nextShadowLength) {
      this._atmosphereShadowLength = nextShadowLength
      this.events.dispatchEvent({
        type: 'change',
        target: this,
        property: 'atmosphereShadowLength'
      })
    }
  }

  override render(
    renderer: WebGLRenderer,
    inputBuffer: WebGLRenderTarget | null,
    outputBuffer: WebGLRenderTarget | null,
    deltaTime = 0,
    stencilTest?: boolean
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

    this.localWeather.update(renderer, deltaTime)
    this.shape.update(renderer, deltaTime)
    this.shapeDetail.update(renderer, deltaTime)
    this.turbulence.update(renderer, deltaTime)

    ++this.frame
    this.updateSharedUniforms(deltaTime)

    shadowPass.update(renderer, this.frame, deltaTime)
    cloudsPass.shadowBuffer = shadowPass.outputBuffer
    cloudsPass.update(renderer, this.frame, deltaTime)

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
    return this.cloudParameterUniforms.localWeatherTexture.value
  }

  set localWeatherTexture(value: Texture | null) {
    this.cloudParameterUniforms.localWeatherTexture.value = value
  }

  get shapeTexture(): Data3DTexture | null {
    return this.cloudParameterUniforms.shapeTexture.value
  }

  set shapeTexture(value: Data3DTexture | null) {
    this.cloudParameterUniforms.shapeTexture.value = value
  }

  get shapeDetailTexture(): Data3DTexture | null {
    return this.cloudParameterUniforms.shapeDetailTexture.value
  }

  set shapeDetailTexture(value: Data3DTexture | null) {
    this.cloudParameterUniforms.shapeDetailTexture.value = value
  }

  get turbulenceTexture(): Texture | null {
    return this.cloudParameterUniforms.turbulenceTexture.value
  }

  set turbulenceTexture(value: Texture | null) {
    this.cloudParameterUniforms.turbulenceTexture.value = value
  }

  get stbnTexture(): Data3DTexture | null {
    return this.cloudsPass.currentMaterial.uniforms.stbnTexture.value
  }

  set stbnTexture(value: Data3DTexture | null) {
    this.cloudsPass.currentMaterial.uniforms.stbnTexture.value = value
    this.shadowPass.currentMaterial.uniforms.stbnTexture.value = value
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

  // Cloud parameter primitives

  get scatteringCoefficient(): number {
    return this.cloudParameterUniforms.scatteringCoefficient.value
  }

  set scatteringCoefficient(value: number) {
    this.cloudParameterUniforms.scatteringCoefficient.value = value
  }

  get absorptionCoefficient(): number {
    return this.cloudParameterUniforms.absorptionCoefficient.value
  }

  set absorptionCoefficient(value: number) {
    this.cloudParameterUniforms.absorptionCoefficient.value = value
  }

  get coverage(): number {
    return this.cloudParameterUniforms.coverage.value
  }

  set coverage(value: number) {
    this.cloudParameterUniforms.coverage.value = value
  }

  get turbulenceDisplacement(): number {
    return this.cloudParameterUniforms.turbulenceDisplacement.value
  }

  set turbulenceDisplacement(value: number) {
    this.cloudParameterUniforms.turbulenceDisplacement.value = value
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
