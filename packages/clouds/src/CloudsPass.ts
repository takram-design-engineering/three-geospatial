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
import {
  definePropertyShorthand,
  defineUniformShorthand,
  lerp,
  type Ellipsoid,
  type PropertyShorthand,
  type UniformShorthand
} from '@takram/three-geospatial'

import { CascadedShadowMaps } from './CascadedShadowMaps'
import { type CloudLayer } from './cloudLayer'
import { Procedural3DTexture } from './Procedural3DTexture'
import { ProceduralTexture } from './ProceduralTexture'
import {
  type RenderMaterial,
  type RenderMaterialUniforms
} from './RenderMaterial'
import { RenderPass } from './RenderPass'
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

const renderPassParamKeys = [
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
  'maxShadowLengthRayDistance'
] as const satisfies Array<keyof RenderMaterialUniforms>

const shadowPassParamKeys = [
  'maxIterationCount',
  'minStepSize',
  'maxStepSize',
  'minDensity',
  'minExtinction',
  'minTransmittance',
  'opticalDepthTailScale'
] as const satisfies Array<keyof ShadowMaterialUniforms>

const shadowMapsParamKeys = [
  'cascadeCount',
  'mapSize',
  'maxFar',
  'farScale',
  'splitMode',
  'splitLambda'
] as const satisfies Array<keyof CascadedShadowMaps>

type CloudsShorthand = UniformShorthand<
  RenderMaterial,
  (typeof renderPassParamKeys)[number]
>

// prettier-ignore
type ShadowShorthand =
  & UniformShorthand<ShadowMaterial, (typeof shadowPassParamKeys)[number]>
  & PropertyShorthand<CascadedShadowMaps, (typeof shadowMapsParamKeys)[number]>

export interface CloudsPassChangeEvent {
  type: 'change'
  target: CloudsPass
  property: 'atmosphereOverlay' | 'atmosphereShadow' | 'atmosphereShadowLength'
}

export interface CloudsPassOptions {
  resolutionScale?: number
  width?: number
  height?: number
  resolutionX?: number
  resolutionY?: number
}

export const cloudsPassOptionsDefaults = {
  resolutionScale: 1,
  width: Resolution.AUTO_SIZE,
  height: Resolution.AUTO_SIZE
} satisfies CloudsPassOptions

export class CloudsPass extends Pass {
  readonly cloudLayers: CloudLayer[] = [
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
    }
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
  private localWeather?: ProceduralTexture
  private shape?: Procedural3DTexture
  private shapeDetail?: Procedural3DTexture
  private turbulence?: ProceduralTexture

  readonly shadowMaps: CascadedShadowMaps
  readonly shadowPass: ShadowPass
  readonly renderPass: RenderPass

  readonly clouds: CloudsShorthand
  readonly shadow: ShadowShorthand

  private _atmosphereOverlay: AtmosphereOverlay | null = null
  private _atmosphereShadow: AtmosphereShadow | null = null
  private _atmosphereShadowLength: AtmosphereShadowLength | null = null

  readonly resolution: Resolution
  readonly events = new EventDispatcher<{
    change: CloudsPassChangeEvent
  }>()

  private frame = 0
  private shadowCascadeCount = 0
  private readonly shadowMapSize = new Vector2()

  constructor(
    private _mainCamera: Camera = new Camera(),
    options?: CloudsPassOptions,
    private readonly atmosphere = AtmosphereParameters.DEFAULT
  ) {
    super('CloudsPass')
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
      ...cloudsPassOptionsDefaults,
      ...options
    }

    this.shadowMaps = new CascadedShadowMaps({
      cascadeCount: 3,
      mapSize: new Vector2().setScalar(512),
      splitLambda: 0.6
    })

    this.parameterUniforms = createCloudParameterUniforms({
      localWeatherTexture: this.localWeather?.texture ?? null,
      localWeatherRepeat: this.localWeatherRepeat,
      localWeatherOffset: this.localWeatherOffset,
      shapeTexture: this.shape?.texture ?? null,
      shapeRepeat: this.shapeRepeat,
      shapeOffset: this.shapeOffset,
      shapeDetailTexture: this.shapeDetail?.texture ?? null,
      shapeDetailRepeat: this.shapeDetailRepeat,
      shapeDetailOffset: this.shapeDetailOffset,
      turbulenceTexture: this.turbulence?.texture ?? null,
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
    this.renderPass = new RenderPass(passOptions, atmosphere)

    this.clouds = defineUniformShorthand(
      {},
      this.renderPass.currentMaterial,
      renderPassParamKeys
    )
    this.shadow = definePropertyShorthand(
      defineUniformShorthand(
        {},
        this.shadowPass.currentMaterial,
        shadowPassParamKeys
      ),
      this.shadowMaps,
      shadowMapsParamKeys
    )

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
    return this._mainCamera
  }

  override set mainCamera(value: Camera) {
    this._mainCamera = value
    this.shadowPass.mainCamera = value
    this.renderPass.mainCamera = value
  }

  override initialize(
    renderer: WebGLRenderer,
    alpha: boolean,
    frameBufferType: TextureDataType
  ): void {
    this.shadowPass.initialize(renderer, alpha, frameBufferType)
    this.renderPass.initialize(renderer, alpha, frameBufferType)
  }

  private updateSharedUniforms(deltaTime: number): void {
    updateCloudLayerUniforms(this.layerUniforms, this.cloudLayers)

    // Apply velocity to offset uniforms.
    const { parameterUniforms: cloudParameterUniforms } = this
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

    this.shadowMaps.update(
      this.mainCamera as PerspectiveCamera,
      // The sun direction must be rotated with the ellipsoid to ensure the
      // frusta are constructed correctly. Note this affects the transformation
      // in the shadow shader.
      vectorScratch.copy(this.sunDirection).applyMatrix4(this.ellipsoidMatrix),
      distance
    )
  }

  private updateAtmosphereComposition(): void {
    const { shadowMaps, shadowPass, renderPass } = this
    const shadowUniforms = shadowPass.currentMaterial.uniforms
    const renderUniforms = renderPass.currentMaterial.uniforms

    const prevOverlay = this._atmosphereOverlay
    const nextOverlay = Object.assign(this._atmosphereOverlay ?? {}, {
      map: renderPass.outputBuffer
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
      mapSize: shadowMaps.mapSize,
      cascadeCount: shadowMaps.cascadeCount,
      intervals: renderUniforms.shadowIntervals.value,
      matrices: renderUniforms.shadowMatrices.value,
      inverseMatrices: shadowUniforms.inverseShadowMatrices.value,
      far: shadowMaps.far,
      topHeight: renderUniforms.shadowTopHeight.value
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
      renderPass.shadowLengthBuffer != null
        ? Object.assign(this._atmosphereShadowLength ?? {}, {
            map: renderPass.shadowLengthBuffer
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
    const { shadowMaps, shadowPass, renderPass } = this
    if (
      shadowMaps.cascadeCount !== this.shadowCascadeCount ||
      !shadowMaps.mapSize.equals(this.shadowMapSize)
    ) {
      const { width, height } = shadowMaps.mapSize
      const depth = shadowMaps.cascadeCount
      this.shadowMapSize.set(width, height)
      this.shadowCascadeCount = depth

      shadowPass.setSize(width, height, depth)
      renderPass.setShadowSize(width, height, depth)
    }

    this.localWeather?.render(renderer, deltaTime)
    this.shape?.render(renderer, deltaTime)
    this.shapeDetail?.render(renderer, deltaTime)
    this.turbulence?.render(renderer, deltaTime)

    ++this.frame
    this.updateSharedUniforms(deltaTime)

    shadowPass.update(renderer, this.frame, deltaTime)
    renderPass.shadowBuffer = shadowPass.outputBuffer
    renderPass.update(renderer, this.frame, deltaTime)

    this.updateAtmosphereComposition()
  }

  override setSize(baseWidth: number, baseHeight: number): void {
    const { resolution } = this
    resolution.setBaseSize(baseWidth, baseHeight)
    const { width, height } = resolution
    this.renderPass.setSize(width, height)
  }

  override setDepthTexture(
    depthTexture: Texture,
    depthPacking?: DepthPackingStrategies
  ): void {
    this.shadowPass.setDepthTexture(depthTexture, depthPacking)
    this.renderPass.setDepthTexture(depthTexture, depthPacking)
  }

  // Textures

  get localWeatherTexture(): Texture | ProceduralTexture | null {
    return this.localWeather ?? this.parameterUniforms.localWeatherTexture.value
  }

  set localWeatherTexture(value: Texture | ProceduralTexture | null) {
    if (value instanceof ProceduralTexture) {
      this.localWeather = value
      this.parameterUniforms.localWeatherTexture.value = value.texture
    } else {
      this.localWeather = undefined
      this.parameterUniforms.localWeatherTexture.value = value
    }
  }

  get shapeTexture(): Data3DTexture | Procedural3DTexture | null {
    return this.shape ?? this.parameterUniforms.shapeTexture.value
  }

  set shapeTexture(value: Data3DTexture | Procedural3DTexture | null) {
    if (value instanceof Procedural3DTexture) {
      this.shape = value
      this.parameterUniforms.shapeTexture.value = value.texture
    } else {
      this.shape = undefined
      this.parameterUniforms.shapeTexture.value = value
    }
  }

  get shapeDetailTexture(): Data3DTexture | Procedural3DTexture | null {
    return this.shapeDetail ?? this.parameterUniforms.shapeDetailTexture.value
  }

  set shapeDetailTexture(value: Data3DTexture | Procedural3DTexture | null) {
    if (value instanceof Procedural3DTexture) {
      this.shapeDetail = value
      this.parameterUniforms.shapeDetailTexture.value = value.texture
    } else {
      this.shapeDetail = undefined
      this.parameterUniforms.shapeDetailTexture.value = value
    }
  }

  get turbulenceTexture(): Texture | ProceduralTexture | null {
    return this.turbulence ?? this.parameterUniforms.turbulenceTexture.value
  }

  set turbulenceTexture(value: Texture | ProceduralTexture | null) {
    if (value instanceof ProceduralTexture) {
      this.turbulence = value
      this.parameterUniforms.turbulenceTexture.value = value.texture
    } else {
      this.turbulence = undefined
      this.parameterUniforms.turbulenceTexture.value = value
    }
  }

  get stbnTexture(): Data3DTexture | null {
    return this.renderPass.currentMaterial.uniforms.stbnTexture.value
  }

  set stbnTexture(value: Data3DTexture | null) {
    this.renderPass.currentMaterial.uniforms.stbnTexture.value = value
    this.shadowPass.currentMaterial.uniforms.stbnTexture.value = value
  }

  // Pass parameters

  get resolutionScale(): number {
    return this.resolution.scale
  }

  set resolutionScale(value: number) {
    this.resolution.scale = value
  }

  get temporalUpscale(): boolean {
    return this.renderPass.temporalUpscale
  }

  set temporalUpscale(value: boolean) {
    this.renderPass.temporalUpscale = value
  }

  get lightShafts(): boolean {
    return this.renderPass.lightShafts
  }

  set lightShafts(value: boolean) {
    this.renderPass.lightShafts = value
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
    return this.renderPass.currentMaterial.irradianceTexture
  }

  set irradianceTexture(value: DataTexture | null) {
    this.renderPass.currentMaterial.irradianceTexture = value
  }

  get scatteringTexture(): Data3DTexture | null {
    return this.renderPass.currentMaterial.scatteringTexture
  }

  set scatteringTexture(value: Data3DTexture | null) {
    this.renderPass.currentMaterial.scatteringTexture = value
  }

  get transmittanceTexture(): DataTexture | null {
    return this.renderPass.currentMaterial.transmittanceTexture
  }

  set transmittanceTexture(value: DataTexture | null) {
    this.renderPass.currentMaterial.transmittanceTexture = value
  }

  get useHalfFloat(): boolean {
    return this.renderPass.currentMaterial.useHalfFloat
  }

  set useHalfFloat(value: boolean) {
    this.renderPass.currentMaterial.useHalfFloat = value
  }

  get ellipsoid(): Ellipsoid {
    return this.renderPass.currentMaterial.ellipsoid
  }

  set ellipsoid(value: Ellipsoid) {
    this.renderPass.currentMaterial.ellipsoid = value
  }

  get photometric(): boolean {
    return this.renderPass.currentMaterial.photometric
  }

  set photometric(value: boolean) {
    this.renderPass.currentMaterial.photometric = value
  }

  get sunAngularRadius(): number {
    return this.renderPass.currentMaterial.sunAngularRadius
  }

  set sunAngularRadius(value: number) {
    this.renderPass.currentMaterial.sunAngularRadius = value
  }
}
