import { Effect, EffectAttribute, Resolution } from 'postprocessing'
import {
  Camera,
  Data3DTexture,
  EventDispatcher,
  Matrix4,
  Texture,
  Vector2,
  Vector3,
  type DataTexture,
  type DepthPackingStrategies,
  type PerspectiveCamera,
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
import {
  definePropertyShorthand,
  defineUniformShorthand,
  lerp,
  type Ellipsoid,
  type PropertyShorthand,
  type UniformShorthand
} from '@takram/three-geospatial'

import { CascadedShadowMaps } from './CascadedShadowMaps'
import { defaultCloudLayer, type CloudLayer } from './cloudLayer'
import {
  type CloudsMaterial,
  type CloudsMaterialUniforms
} from './CloudsMaterial'
import { CloudsPass } from './CloudsPass'
import { type Procedural3DTexture } from './Procedural3DTexture'
import { type ProceduralTexture } from './ProceduralTexture'
import { defaults, qualityPresets, type QualityPreset } from './qualityPresets'
import {
  type ShadowMaterial,
  type ShadowMaterialUniforms
} from './ShadowMaterial'
import { ShadowPass } from './ShadowPass'
import {
  createAtmosphereUniforms,
  createCloudLayerUniforms,
  createCloudParameterUniforms,
  updateCloudLayerUniforms,
  type AtmosphereUniforms,
  type CloudLayerUniforms,
  type CloudParameterUniforms
} from './uniforms'

const vector3Scratch = /*#__PURE__*/ new Vector3()
const vector2Scratch = /*#__PURE__*/ new Vector2()

const cloudsUniformKeys = [
  'maxIterationCount',
  'minStepSize',
  'maxStepSize',
  'maxRayDistance',
  'perspectiveStepScale',
  'minDensity',
  'minExtinction',
  'minTransmittance',
  'maxIterationCountToSun',
  'maxIterationCountToGround',
  'minSecondaryStepSize',
  'secondaryStepScale',
  'maxShadowFilterRadius',
  'maxShadowLengthIterationCount',
  'minShadowLengthStepSize',
  'maxShadowLengthRayDistance',
  'hazeDensityScale',
  'hazeExponent'
] as const satisfies Array<keyof CloudsMaterialUniforms>

// prettier-ignore
const cloudsMaterialParameterKeys = [
  'multiScatteringOctaves',
  'accurateSunSkyIrradiance',
  'accuratePhaseFunction',
] as const satisfies Array<keyof CloudsMaterial>

const shadowUniformKeys = [
  'maxIterationCount',
  'minStepSize',
  'maxStepSize',
  'minDensity',
  'minExtinction',
  'minTransmittance',
  'opticalDepthTailScale'
] as const satisfies Array<keyof ShadowMaterialUniforms>

// prettier-ignore
const shadowMaterialParameterKeys = [
  'temporalJitter'
] as const satisfies Array<keyof ShadowMaterial>

// prettier-ignore
const shadowPassParameterKeys = [
  'temporalPass'
] as const satisfies Array<keyof ShadowPass>

const shadowMapsParameterKeys = [
  'cascadeCount',
  'mapSize',
  'maxFar',
  'farScale',
  'splitMode',
  'splitLambda'
] as const satisfies Array<keyof CascadedShadowMaps>

type CloudsShorthand = UniformShorthand<
  CloudsMaterial,
  (typeof cloudsUniformKeys)[number]
> &
  PropertyShorthand<[CloudsMaterial, typeof cloudsMaterialParameterKeys]>

type ShadowShorthand = UniformShorthand<
  ShadowMaterial,
  (typeof shadowUniformKeys)[number]
> &
  PropertyShorthand<
    [
      ShadowMaterial,
      typeof shadowMaterialParameterKeys,
      ShadowPass,
      typeof shadowPassParameterKeys,
      CascadedShadowMaps,
      typeof shadowMapsParameterKeys
    ]
  >

export interface CloudsEffectChangeEvent {
  type: 'change'
  target?: CloudsEffect
  property?: 'atmosphereOverlay' | 'atmosphereShadow' | 'atmosphereShadowLength'
}

const changeEvent: CloudsEffectChangeEvent = {
  type: 'change'
}

export interface CloudsEffectOptions {
  resolutionScale?: number
  width?: number
  height?: number
  resolutionX?: number
  resolutionY?: number
}

export const cloudsPassOptionsDefaults = {
  resolutionScale: defaults.resolutionScale,
  width: Resolution.AUTO_SIZE,
  height: Resolution.AUTO_SIZE
} satisfies CloudsEffectOptions

// We explicitly use Effect instead of Pass, even though this only renders to
// render buffers. Pass, at least when used with R3F, tends to be unstable
// during hot reloading. This should not impact performance since this effect
// can be merged.
export class CloudsEffect extends Effect {
  readonly cloudLayers: CloudLayer[] = [
    {
      channel: 'r',
      altitude: 750,
      height: 650,
      densityScale: 0.2,
      shapeAmount: 1,
      shapeDetailAmount: 1,
      weatherExponent: 1,
      shapeAlteringBias: 0.35,
      coverageFilterWidth: 0.6,
      shadow: true
    },
    {
      channel: 'g',
      altitude: 1000,
      height: 1200,
      densityScale: 0.2,
      shapeAmount: 1,
      shapeDetailAmount: 1,
      weatherExponent: 1,
      shapeAlteringBias: 0.35,
      coverageFilterWidth: 0.6,
      shadow: true
    },
    {
      channel: 'b',
      altitude: 7500,
      height: 500,
      densityScale: 0.003,
      shapeAmount: 0.4,
      shapeDetailAmount: 0,
      weatherExponent: 1,
      shapeAlteringBias: 0.35,
      coverageFilterWidth: 0.5
    },
    {}
  ]

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
  private readonly parameterUniforms: CloudParameterUniforms
  private readonly layerUniforms: CloudLayerUniforms
  private readonly atmosphereUniforms: AtmosphereUniforms

  readonly localWeatherVelocity = new Vector2()
  readonly shapeVelocity = new Vector3()
  readonly shapeDetailVelocity = new Vector3()

  // Weather and shape procedural textures
  private proceduralLocalWeather?: ProceduralTexture
  private proceduralShape?: Procedural3DTexture
  private proceduralShapeDetail?: Procedural3DTexture
  private proceduralTurbulence?: ProceduralTexture

  readonly shadowMaps: CascadedShadowMaps
  readonly shadowPass: ShadowPass
  readonly cloudsPass: CloudsPass

  readonly clouds: CloudsShorthand
  readonly shadow: ShadowShorthand

  private _atmosphereOverlay: AtmosphereOverlay | null = null
  private _atmosphereShadow: AtmosphereShadow | null = null
  private _atmosphereShadowLength: AtmosphereShadowLength | null = null

  readonly resolution: Resolution
  readonly events = new EventDispatcher<{
    change: CloudsEffectChangeEvent
  }>()

  private frame = 0
  private shadowCascadeCount = 0
  private readonly shadowMapSize = new Vector2()

  constructor(
    private camera: Camera = new Camera(),
    options?: CloudsEffectOptions,
    private readonly atmosphere = AtmosphereParameters.DEFAULT
  ) {
    super(
      'CloudsEffect',
      /* glsl */ `
        void mainImage(
          const vec4 inputColor,
          const vec2 uv,
          out vec4 outputColor
        ) {
          // Pass though here and we'll compose the clouds in
          // AerialPerspectiveEffect, for now.
          outputColor = inputColor;
        }
      `,
      { attributes: EffectAttribute.DEPTH }
    )

    const {
      resolutionScale,
      width,
      height,
      resolutionX = width,
      resolutionY = height
    } = {
      ...cloudsPassOptionsDefaults,
      ...options
    }

    this.shadowMaps = new CascadedShadowMaps({
      cascadeCount: defaults.shadow.cascadeCount,
      mapSize: defaults.shadow.mapSize,
      splitLambda: 0.6
    })

    this.parameterUniforms = createCloudParameterUniforms({
      localWeatherTexture: this.proceduralLocalWeather?.texture ?? null,
      localWeatherRepeat: this.localWeatherRepeat,
      localWeatherOffset: this.localWeatherOffset,
      shapeTexture: this.proceduralShape?.texture ?? null,
      shapeRepeat: this.shapeRepeat,
      shapeOffset: this.shapeOffset,
      shapeDetailTexture: this.proceduralShapeDetail?.texture ?? null,
      shapeDetailRepeat: this.shapeDetailRepeat,
      shapeDetailOffset: this.shapeDetailOffset,
      turbulenceTexture: this.proceduralTurbulence?.texture ?? null,
      turbulenceRepeat: this.turbulenceRepeat
    })

    this.layerUniforms = createCloudLayerUniforms()

    this.atmosphereUniforms = createAtmosphereUniforms(atmosphere, {
      ellipsoidCenter: this.ellipsoidCenter,
      ellipsoidMatrix: this.ellipsoidMatrix,
      inverseEllipsoidMatrix: this.inverseEllipsoidMatrix,
      altitudeCorrection: this.altitudeCorrection,
      sunDirection: this.sunDirection
    })

    const passOptions = {
      shadow: this.shadowMaps,
      parameterUniforms: this.parameterUniforms,
      layerUniforms: this.layerUniforms,
      atmosphereUniforms: this.atmosphereUniforms
    }
    this.shadowPass = new ShadowPass(passOptions)
    this.cloudsPass = new CloudsPass(passOptions, atmosphere)

    this.clouds = definePropertyShorthand(
      defineUniformShorthand(
        {},
        this.cloudsPass.currentMaterial,
        cloudsUniformKeys
      ),
      this.cloudsPass.currentMaterial,
      cloudsMaterialParameterKeys
    )
    this.shadow = definePropertyShorthand(
      defineUniformShorthand(
        {},
        this.shadowPass.currentMaterial,
        shadowUniformKeys
      ),
      this.shadowPass.currentMaterial,
      shadowMaterialParameterKeys,
      this.shadowPass,
      shadowPassParameterKeys,
      this.shadowMaps,
      shadowMapsParameterKeys
    )

    this.resolution = new Resolution(
      this,
      resolutionX,
      resolutionY,
      resolutionScale
    )
    this.resolution.addEventListener('change', this.onResolutionChange)
  }

  private readonly onResolutionChange = (): void => {
    this.setSize(this.resolution.baseWidth, this.resolution.baseHeight)
  }

  override get mainCamera(): Camera {
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

  private updateSharedUniforms(deltaTime: number): void {
    updateCloudLayerUniforms(this.layerUniforms, this.cloudLayers)

    // Apply velocity to offset uniforms.
    const { parameterUniforms } = this
    parameterUniforms.localWeatherOffset.value.add(
      vector2Scratch.copy(this.localWeatherVelocity).multiplyScalar(deltaTime)
    )
    parameterUniforms.shapeOffset.value.add(
      vector3Scratch.copy(this.shapeVelocity).multiplyScalar(deltaTime)
    )
    parameterUniforms.shapeDetailOffset.value.add(
      vector3Scratch.copy(this.shapeDetailVelocity).multiplyScalar(deltaTime)
    )

    // Update atmosphere uniforms.
    const inverseEllipsoidMatrix = this.inverseEllipsoidMatrix
      .copy(this.ellipsoidMatrix)
      .invert()
    const cameraPositionECEF = this.camera
      .getWorldPosition(vector3Scratch)
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
      vector3Scratch
    )
    const zenithAngle = this.sunDirection.dot(surfaceNormal)
    const distance = lerp(1e6, 1e3, zenithAngle)

    this.shadowMaps.update(
      this.camera as PerspectiveCamera,
      // The sun direction must be rotated with the ellipsoid to ensure the
      // frusta are constructed correctly. Note this affects the transformation
      // in the shadow shader.
      vector3Scratch.copy(this.sunDirection).applyMatrix4(this.ellipsoidMatrix),
      distance
    )
  }

  private updateWeatherTextureChannels(): void {
    const { cloudLayers } = this
    const { channel } = defaultCloudLayer
    const value =
      (cloudLayers[0]?.channel ?? channel) +
      (cloudLayers[1]?.channel ?? channel) +
      (cloudLayers[2]?.channel ?? channel) +
      (cloudLayers[3]?.channel ?? channel)
    this.cloudsPass.currentMaterial.weatherChannels = value
    this.shadowPass.currentMaterial.weatherChannels = value
  }

  private updateAtmosphereComposition(): void {
    const { shadowMaps, shadowPass, cloudsPass } = this
    const shadowUniforms = shadowPass.currentMaterial.uniforms
    const cloudsUniforms = cloudsPass.currentMaterial.uniforms

    const prevOverlay = this._atmosphereOverlay
    const nextOverlay = Object.assign(this._atmosphereOverlay ?? {}, {
      map: cloudsPass.outputBuffer
    } satisfies AtmosphereOverlay)
    if (prevOverlay !== nextOverlay) {
      this._atmosphereOverlay = nextOverlay
      changeEvent.target = this
      changeEvent.property = 'atmosphereOverlay'
      this.events.dispatchEvent(changeEvent)
    }

    const prevShadow = this._atmosphereShadow
    const nextShadow = Object.assign(this._atmosphereShadow ?? {}, {
      map: shadowPass.outputBuffer,
      mapSize: shadowMaps.mapSize,
      cascadeCount: shadowMaps.cascadeCount,
      intervals: cloudsUniforms.shadowIntervals.value,
      matrices: cloudsUniforms.shadowMatrices.value,
      inverseMatrices: shadowUniforms.inverseShadowMatrices.value,
      far: shadowMaps.far,
      topHeight: cloudsUniforms.shadowTopHeight.value
    } satisfies AtmosphereShadow)
    if (prevShadow !== nextShadow) {
      this._atmosphereShadow = nextShadow
      changeEvent.target = this
      changeEvent.property = 'atmosphereShadow'
      this.events.dispatchEvent(changeEvent)
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
      changeEvent.target = this
      changeEvent.property = 'atmosphereShadowLength'
      this.events.dispatchEvent(changeEvent)
    }
  }

  override update(
    renderer: WebGLRenderer,
    inputBuffer: WebGLRenderTarget,
    deltaTime = 0
  ): void {
    const { shadowMaps, shadowPass, cloudsPass } = this
    if (
      shadowMaps.cascadeCount !== this.shadowCascadeCount ||
      !shadowMaps.mapSize.equals(this.shadowMapSize)
    ) {
      const { width, height } = shadowMaps.mapSize
      const depth = shadowMaps.cascadeCount
      this.shadowMapSize.set(width, height)
      this.shadowCascadeCount = depth

      shadowPass.setSize(width, height, depth)
      cloudsPass.setShadowSize(width, height, depth)
    }

    this.proceduralLocalWeather?.render(renderer, deltaTime)
    this.proceduralShape?.render(renderer, deltaTime)
    this.proceduralShapeDetail?.render(renderer, deltaTime)
    this.proceduralTurbulence?.render(renderer, deltaTime)

    ++this.frame
    this.updateSharedUniforms(deltaTime)
    this.updateWeatherTextureChannels()

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

  // eslint-disable-next-line accessor-pairs
  set qualityPreset(value: QualityPreset) {
    const { clouds, shadow, ...props } = qualityPresets[value]
    Object.assign(this, props)
    Object.assign(this.clouds, clouds)
    Object.assign(this.shadow, shadow)
  }

  // Textures

  get localWeatherTexture(): Texture | ProceduralTexture | null {
    return (
      this.proceduralLocalWeather ??
      this.parameterUniforms.localWeatherTexture.value
    )
  }

  set localWeatherTexture(value: Texture | ProceduralTexture | null) {
    if (value instanceof Texture || value == null) {
      this.proceduralLocalWeather = undefined
      this.parameterUniforms.localWeatherTexture.value = value
    } else {
      this.proceduralLocalWeather = value
      this.parameterUniforms.localWeatherTexture.value = value.texture
    }
  }

  get shapeTexture(): Data3DTexture | Procedural3DTexture | null {
    return this.proceduralShape ?? this.parameterUniforms.shapeTexture.value
  }

  set shapeTexture(value: Data3DTexture | Procedural3DTexture | null) {
    if (value instanceof Data3DTexture || value == null) {
      this.proceduralShape = undefined
      this.parameterUniforms.shapeTexture.value = value
    } else {
      this.proceduralShape = value
      this.parameterUniforms.shapeTexture.value = value.texture
    }
  }

  get shapeDetailTexture(): Data3DTexture | Procedural3DTexture | null {
    return (
      this.proceduralShapeDetail ??
      this.parameterUniforms.shapeDetailTexture.value
    )
  }

  set shapeDetailTexture(value: Data3DTexture | Procedural3DTexture | null) {
    if (value instanceof Data3DTexture || value == null) {
      this.proceduralShapeDetail = undefined
      this.parameterUniforms.shapeDetailTexture.value = value
    } else {
      this.proceduralShapeDetail = value
      this.parameterUniforms.shapeDetailTexture.value = value.texture
    }
  }

  get turbulenceTexture(): Texture | ProceduralTexture | null {
    return (
      this.proceduralTurbulence ??
      this.parameterUniforms.turbulenceTexture.value
    )
  }

  set turbulenceTexture(value: Texture | ProceduralTexture | null) {
    if (value instanceof Texture || value == null) {
      this.proceduralTurbulence = undefined
      this.parameterUniforms.turbulenceTexture.value = value
    } else {
      this.proceduralTurbulence = value
      this.parameterUniforms.turbulenceTexture.value = value.texture
    }
  }

  get stbnTexture(): Data3DTexture | null {
    return this.cloudsPass.currentMaterial.uniforms.stbnTexture.value
  }

  set stbnTexture(value: Data3DTexture | null) {
    this.cloudsPass.currentMaterial.uniforms.stbnTexture.value = value
    this.shadowPass.currentMaterial.uniforms.stbnTexture.value = value
  }

  // Rendering controls

  get resolutionScale(): number {
    return this.resolution.scale
  }

  set resolutionScale(value: number) {
    this.resolution.scale = value
  }

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

  get shapeDetail(): boolean {
    return this.cloudsPass.currentMaterial.shapeDetail
  }

  set shapeDetail(value: boolean) {
    this.cloudsPass.currentMaterial.shapeDetail = value
    this.shadowPass.currentMaterial.shapeDetail = value
  }

  get turbulence(): boolean {
    return this.cloudsPass.currentMaterial.turbulence
  }

  set turbulence(value: boolean) {
    this.cloudsPass.currentMaterial.turbulence = value
    this.shadowPass.currentMaterial.turbulence = value
  }

  get haze(): boolean {
    return this.cloudsPass.currentMaterial.haze
  }

  set haze(value: boolean) {
    this.cloudsPass.currentMaterial.haze = value
  }

  // Cloud parameter primitives

  get scatteringCoefficient(): number {
    return this.parameterUniforms.scatteringCoefficient.value
  }

  set scatteringCoefficient(value: number) {
    this.parameterUniforms.scatteringCoefficient.value = value
  }

  get absorptionCoefficient(): number {
    return this.parameterUniforms.absorptionCoefficient.value
  }

  set absorptionCoefficient(value: number) {
    this.parameterUniforms.absorptionCoefficient.value = value
  }

  get coverage(): number {
    return this.parameterUniforms.coverage.value
  }

  set coverage(value: number) {
    this.parameterUniforms.coverage.value = value
  }

  get turbulenceDisplacement(): number {
    return this.parameterUniforms.turbulenceDisplacement.value
  }

  set turbulenceDisplacement(value: number) {
    this.parameterUniforms.turbulenceDisplacement.value = value
  }

  // Scattering parameters

  get scatterAnisotropy1(): number {
    return this.cloudsPass.currentMaterial.scatterAnisotropy1
  }

  set scatterAnisotropy1(value: number) {
    this.cloudsPass.currentMaterial.scatterAnisotropy1 = value
  }

  get scatterAnisotropy2(): number {
    return this.cloudsPass.currentMaterial.scatterAnisotropy2
  }

  set scatterAnisotropy2(value: number) {
    this.cloudsPass.currentMaterial.scatterAnisotropy2 = value
  }

  get scatterAnisotropyMix(): number {
    return this.cloudsPass.currentMaterial.scatterAnisotropyMix
  }

  set scatterAnisotropyMix(value: number) {
    this.cloudsPass.currentMaterial.scatterAnisotropyMix = value
  }

  get skyIrradianceScale(): number {
    return this.cloudsPass.currentMaterial.uniforms.skyIrradianceScale.value
  }

  set skyIrradianceScale(value: number) {
    this.cloudsPass.currentMaterial.uniforms.skyIrradianceScale.value = value
  }

  get groundIrradianceScale(): number {
    return this.cloudsPass.currentMaterial.uniforms.groundIrradianceScale.value
  }

  set groundIrradianceScale(value: number) {
    this.cloudsPass.currentMaterial.uniforms.groundIrradianceScale.value = value
  }

  get powderScale(): number {
    return this.cloudsPass.currentMaterial.uniforms.powderScale.value
  }

  set powderScale(value: number) {
    this.cloudsPass.currentMaterial.uniforms.powderScale.value = value
  }

  get powderExponent(): number {
    return this.cloudsPass.currentMaterial.uniforms.powderExponent.value
  }

  set powderExponent(value: number) {
    this.cloudsPass.currentMaterial.uniforms.powderExponent.value = value
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
