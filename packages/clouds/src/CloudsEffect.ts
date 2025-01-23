import { Effect, EffectAttribute, Resolution, ShaderPass } from 'postprocessing'
import {
  Camera,
  HalfFloatType,
  LinearFilter,
  Matrix4,
  RedFormat,
  Vector2,
  Vector3,
  WebGLArrayRenderTarget,
  WebGLRenderTarget,
  type Data3DTexture,
  type DataArrayTexture,
  type DataTexture,
  type DepthPackingStrategies,
  type Event,
  type PerspectiveCamera,
  type Texture,
  type TextureDataType,
  type WebGLRenderer
} from 'three'

import { AtmosphereParameters } from '@takram/three-atmosphere'
import { lerp, type Ellipsoid } from '@takram/three-geospatial'

import { CascadedShadowMaps } from './CascadedShadowMaps'
import { CloudShape } from './CloudShape'
import { CloudShapeDetail } from './CloudShapeDetail'
import { CloudsMaterial } from './CloudsMaterial'
import { CloudsResolveMaterial } from './CloudsResolveMaterial'
import { LocalWeather } from './LocalWeather'
import { ShaderArrayPass } from './ShaderArrayPass'
import { ShadowMaterial } from './ShadowMaterial'
import { ShadowResolveMaterial } from './ShadowResolveMaterial'
import { updateCloudLayerUniforms, type CloudLayers } from './uniforms'

import fragmentShader from './shaders/cloudsEffect.frag?raw'

const vectorScratch = /*#__PURE__*/ new Vector3()
const matrixScratch = /*#__PURE__*/ new Matrix4()

function createShadowRenderTarget(name: string): WebGLArrayRenderTarget {
  const renderTarget = new WebGLArrayRenderTarget(1, 1, 1, {
    depthBuffer: false,
    stencilBuffer: false
  })
  // Constructor option doesn't work
  renderTarget.texture.type = HalfFloatType
  renderTarget.texture.minFilter = LinearFilter
  renderTarget.texture.magFilter = LinearFilter
  renderTarget.texture.name = name
  return renderTarget
}

type CloudsRenderTarget = WebGLRenderTarget & {
  depthVelocity: Texture | null
  shadowLength: Texture | null
}

interface CloudsRenderTargetOptions {
  depthVelocity: boolean
  shadowLength: boolean
}

function createCloudsRenderTarget(
  name: string,
  { depthVelocity, shadowLength }: CloudsRenderTargetOptions
): CloudsRenderTarget {
  const renderTarget: WebGLRenderTarget & {
    depthVelocity?: Texture
    shadowLength?: Texture
  } = new WebGLRenderTarget(1, 1, {
    depthBuffer: false,
    stencilBuffer: false,
    type: HalfFloatType
  })
  renderTarget.texture.minFilter = LinearFilter
  renderTarget.texture.magFilter = LinearFilter
  renderTarget.texture.name = name

  let depthVelocityBuffer
  if (depthVelocity) {
    depthVelocityBuffer = renderTarget.texture.clone()
    depthVelocityBuffer.isRenderTargetTexture = true
    renderTarget.depthVelocity = depthVelocityBuffer
    renderTarget.textures.push(depthVelocityBuffer)
  }
  let shadowLengthBuffer
  if (shadowLength) {
    shadowLengthBuffer = renderTarget.texture.clone()
    shadowLengthBuffer.isRenderTargetTexture = true
    shadowLengthBuffer.format = RedFormat
    renderTarget.shadowLength = shadowLengthBuffer
    renderTarget.textures.push(shadowLengthBuffer)
  }

  return Object.assign(renderTarget, {
    depthVelocity: depthVelocityBuffer ?? null,
    shadowLength: shadowLengthBuffer ?? null
  })
}

function applyVelocity(
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
      minHeight: 750,
      maxHeight: 1400,
      extinctionCoefficient: 0.4,
      detailAmount: 1,
      weatherExponent: 1,
      coverageFilterWidth: 0.6,
      shadow: true
    },
    {
      minHeight: 1000,
      maxHeight: 2200,
      extinctionCoefficient: 0.5,
      detailAmount: 1,
      weatherExponent: 1,
      coverageFilterWidth: 0.6,
      shadow: true
    },
    {
      minHeight: 7500,
      maxHeight: 8000,
      extinctionCoefficient: 0.005,
      detailAmount: 0.4,
      weatherExponent: 1,
      coverageFilterWidth: 0.5
      // minHeight: 7500,
      // maxHeight: 9000,
      // extinctionCoefficient: 0.002,
      // detailAmount: 0.8,
      // weatherExponent: 1,
      // coverageFilterWidth: 0.5
    },
    {
      minHeight: 0,
      maxHeight: 0,
      extinctionCoefficient: 0,
      detailAmount: 0,
      weatherExponent: 1,
      coverageFilterWidth: 0.0
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

  // Beer shadow map
  readonly shadow: CascadedShadowMaps
  private shadowRenderTarget!: WebGLArrayRenderTarget
  readonly shadowMaterial: ShadowMaterial
  readonly shadowPass: ShaderArrayPass
  private shadowResolveRenderTarget!: WebGLArrayRenderTarget
  readonly shadowResolveMaterial: ShadowResolveMaterial
  readonly shadowResolvePass: ShaderArrayPass
  private shadowHistoryRenderTarget!: WebGLArrayRenderTarget

  // Clouds
  private cloudsRenderTarget!: CloudsRenderTarget
  readonly cloudsMaterial: CloudsMaterial
  readonly cloudsPass: ShaderPass
  private cloudsResolveRenderTarget!: CloudsRenderTarget
  readonly cloudsResolveMaterial: CloudsResolveMaterial
  readonly cloudsResolvePass: ShaderPass
  private cloudsHistoryRenderTarget!: CloudsRenderTarget

  readonly resolution: Resolution
  private frame = 0
  private shadowCascadeCount = 0
  private readonly shadowMapSize = new Vector2()

  constructor(
    private camera: Camera = new Camera(),
    options?: CloudsEffectOptions,
    private readonly atmosphere = AtmosphereParameters.DEFAULT
  ) {
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

    super('CloudsEffect', fragmentShader, {
      attributes: EffectAttribute.DEPTH
    })

    // Beer shadow map
    this.shadow = new CascadedShadowMaps({
      cascadeCount: 3,
      mapSize: new Vector2().setScalar(512),
      splitLambda: 0.6
    })
    this.shadowMaterial = new ShadowMaterial(
      {
        ellipsoidCenterRef: this.ellipsoidCenter,
        ellipsoidMatrixRef: this.ellipsoidMatrix,
        sunDirectionRef: this.sunDirection,
        localWeatherTexture: this.localWeather.texture,
        shapeTexture: this.shape.texture,
        shapeDetailTexture: this.shapeDetail.texture
      },
      atmosphere
    )
    this.shadowPass = new ShaderArrayPass(this.shadowMaterial)
    this.shadowResolveMaterial = new ShadowResolveMaterial()
    this.shadowResolvePass = new ShaderArrayPass(this.shadowResolveMaterial)
    this.initShadowRenderTargets()

    // Clouds
    this.cloudsMaterial = new CloudsMaterial(
      {
        ellipsoidCenterRef: this.ellipsoidCenter,
        ellipsoidMatrixRef: this.ellipsoidMatrix,
        sunDirectionRef: this.sunDirection,
        localWeatherTexture: this.localWeather.texture,
        shapeTexture: this.shape.texture,
        shapeDetailTexture: this.shapeDetail.texture
      },
      atmosphere
    )
    this.cloudsPass = new ShaderPass(this.cloudsMaterial)
    this.cloudsResolveMaterial = new CloudsResolveMaterial()
    this.cloudsResolvePass = new ShaderPass(this.cloudsResolveMaterial)
    this.initCloudsRenderTargets({
      depthVelocity: true,
      shadowLength: false
    })

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

  private initShadowRenderTargets(): void {
    this.shadowRenderTarget?.dispose()
    this.shadowResolveRenderTarget?.dispose()
    this.shadowHistoryRenderTarget?.dispose()

    const current = createShadowRenderTarget('Shadow')
    const resolve = createShadowRenderTarget('Shadow.A')
    const history = createShadowRenderTarget('Shadow.B')

    this.shadowRenderTarget = current
    this.shadowResolveRenderTarget = resolve
    this.shadowHistoryRenderTarget = history

    const resolveUniforms = this.shadowResolveMaterial.uniforms
    resolveUniforms.inputBuffer.value = current.texture
    resolveUniforms.historyBuffer.value = history.texture
  }

  private initCloudsRenderTargets({
    depthVelocity,
    shadowLength
  }: CloudsRenderTargetOptions): void {
    this.cloudsRenderTarget?.dispose()
    this.cloudsResolveRenderTarget?.dispose()
    this.cloudsHistoryRenderTarget?.dispose()

    const current = createCloudsRenderTarget('Clouds', {
      depthVelocity,
      shadowLength
    })
    const resolve = createCloudsRenderTarget('Clouds.A', {
      depthVelocity: false,
      shadowLength
    })
    const history = createCloudsRenderTarget('Clouds.B', {
      depthVelocity: false,
      shadowLength
    })

    this.cloudsRenderTarget = current
    this.cloudsResolveRenderTarget = resolve
    this.cloudsHistoryRenderTarget = history

    const resolveUniforms = this.cloudsResolveMaterial.uniforms
    resolveUniforms.colorBuffer.value = current.texture
    resolveUniforms.depthVelocityBuffer.value = current.depthVelocity
    resolveUniforms.shadowLengthBuffer.value = current.shadowLength
    resolveUniforms.colorHistoryBuffer.value = history.texture
    resolveUniforms.shadowLengthHistoryBuffer.value = history.shadowLength
  }

  private readonly onResolutionChange = (): void => {
    this.setSize(this.resolution.baseWidth, this.resolution.baseHeight)
  }

  get mainCamera(): Camera {
    return this.camera
  }

  override set mainCamera(value: Camera) {
    this.camera = value
    this.shadowMaterial.copyCameraSettings(value)
    this.cloudsMaterial.copyCameraSettings(value)
  }

  override initialize(
    renderer: WebGLRenderer,
    alpha: boolean,
    frameBufferType: TextureDataType
  ): void {
    this.shadowPass.initialize(renderer, alpha, frameBufferType)
    this.shadowResolvePass.initialize(renderer, alpha, frameBufferType)
    this.cloudsPass.initialize(renderer, alpha, frameBufferType)
    this.cloudsResolvePass.initialize(renderer, alpha, frameBufferType)
  }

  private updateShadowMap(): void {
    const shadow = this.shadow
    if (
      shadow.cascadeCount !== this.shadowCascadeCount ||
      !shadow.mapSize.equals(this.shadowMapSize)
    ) {
      const { width, height } = shadow.mapSize
      const depth = shadow.cascadeCount

      this.shadowCascadeCount = depth
      this.shadowMaterial.cascadeCount = depth
      this.shadowResolveMaterial.cascadeCount = depth
      this.cloudsMaterial.shadowCascadeCount = depth

      this.shadowMapSize.set(width, height)
      this.shadowMaterial.setSize(width, height)
      this.shadowResolveMaterial.setSize(width, height)
      this.cloudsMaterial.setShadowSize(width, height)

      this.shadowRenderTarget.setSize(width, height, depth * 2) // For velocity
      this.shadowResolveRenderTarget.setSize(width, height, depth)
      this.shadowHistoryRenderTarget.setSize(width, height, depth)
    }

    // Increase light's distance to the target when the sun is at the horizon.
    const inverseEllipsoidMatrix = matrixScratch
      .copy(this.ellipsoidMatrix)
      .invert()
    const cameraPositionECEF = this.camera
      .getWorldPosition(vectorScratch)
      .applyMatrix4(inverseEllipsoidMatrix)
      .sub(this.ellipsoidCenter)
    const surfaceNormal = this.ellipsoid.getSurfaceNormal(
      cameraPositionECEF,
      vectorScratch
    )
    const zenithAngle = this.sunDirection.dot(surfaceNormal)
    const distance = lerp(1e6, 1e3, zenithAngle)

    this.shadow.update(
      this.camera as PerspectiveCamera,
      // The sun direction must be rotated with the ellipsoid to ensure the
      // frusta are constructed correctly. Note this affects the transformation
      // in the shadow shader.
      vectorScratch.copy(this.sunDirection).applyMatrix4(this.ellipsoidMatrix),
      distance
    )
  }

  private copyShadowParameters(): void {
    const shadow = this.shadow
    const shadowUniforms = this.shadowMaterial.uniforms
    const cloudsUniforms = this.cloudsMaterial.uniforms
    for (let i = 0; i < shadow.cascadeCount; ++i) {
      const cascade = shadow.cascades[i]
      shadowUniforms.inverseShadowMatrices.value[i].copy(cascade.inverseMatrix)
      cloudsUniforms.shadowIntervals.value[i].copy(cascade.interval)
      cloudsUniforms.shadowMatrices.value[i].copy(cascade.matrix)
    }
    cloudsUniforms.shadowFar.value = shadow.far
  }

  private updateParameters(deltaTime: number): void {
    ++this.frame
    const shadowUniforms = this.shadowMaterial.uniforms
    const cloudsUniforms = this.cloudsMaterial.uniforms
    updateCloudLayerUniforms(shadowUniforms, this.cloudLayers)
    updateCloudLayerUniforms(cloudsUniforms, this.cloudLayers)
    shadowUniforms.frame.value = this.frame
    cloudsUniforms.frame.value = this.frame
    this.cloudsResolveMaterial.uniforms.frame.value = this.frame

    // Apply velocity to offset uniforms.
    applyVelocity(
      this.localWeatherVelocity,
      deltaTime,
      shadowUniforms.localWeatherOffset.value,
      cloudsUniforms.localWeatherOffset.value
    )
    applyVelocity(
      this.shapeVelocity,
      deltaTime,
      shadowUniforms.shapeOffset.value,
      cloudsUniforms.shapeOffset.value
    )
    applyVelocity(
      this.localWeatherVelocity,
      deltaTime,
      shadowUniforms.shapeDetailOffset.value,
      cloudsUniforms.shapeDetailOffset.value
    )

    // Update camera-related uniforms and shadow matrix.
    this.shadowMaterial.copyCameraSettings(this.camera)
    this.cloudsMaterial.copyCameraSettings(this.camera)
    this.copyShadowParameters()
  }

  private copyReprojectionParameters(): void {
    const shadow = this.shadow
    const shadowUniforms = this.shadowMaterial.uniforms
    for (let i = 0; i < shadow.cascadeCount; ++i) {
      const cascade = shadow.cascades[i]
      shadowUniforms.reprojectionMatrices.value[i].copy(cascade.matrix)
    }
    this.cloudsMaterial.copyReprojectionMatrix(this.camera)
  }

  private swapShadowBuffers(): void {
    const nextResolve = this.shadowHistoryRenderTarget
    const nextHistory = this.shadowResolveRenderTarget
    this.shadowResolveRenderTarget = nextResolve
    this.shadowHistoryRenderTarget = nextHistory

    const resolveUniforms = this.shadowResolveMaterial.uniforms
    resolveUniforms.historyBuffer.value = nextHistory.texture
  }

  private swapCloudsBuffers(): void {
    const nextResolve = this.cloudsHistoryRenderTarget
    const nextHistory = this.cloudsResolveRenderTarget
    this.cloudsResolveRenderTarget = nextResolve
    this.cloudsHistoryRenderTarget = nextHistory

    const resolveUniforms = this.cloudsResolveMaterial.uniforms
    resolveUniforms.colorHistoryBuffer.value = nextHistory.texture
    resolveUniforms.shadowLengthHistoryBuffer.value = nextHistory.shadowLength
  }

  override update(
    renderer: WebGLRenderer,
    inputBuffer: WebGLRenderTarget,
    deltaTime = 0
  ): void {
    this.localWeather.update(renderer)
    this.shape.update(renderer)
    this.shapeDetail.update(renderer)

    this.updateShadowMap()
    this.updateParameters(deltaTime)

    // Render beer shadow map.
    this.shadowPass.render(renderer, null, this.shadowRenderTarget)
    this.shadowResolvePass.render(
      renderer,
      null,
      this.shadowResolveRenderTarget
    )

    // Render clouds.
    this.cloudsMaterial.uniforms.shadowBuffer.value =
      this.shadowResolveRenderTarget.texture
    this.cloudsPass.render(renderer, null, this.cloudsRenderTarget)
    this.cloudsResolvePass.render(
      renderer,
      null,
      this.cloudsResolveRenderTarget
    )

    // Store the current view and projection matrices for the next reprojection.
    this.copyReprojectionParameters()

    // Swap resolve and history render targets for the next render.
    this.swapShadowBuffers()
    this.swapCloudsBuffers()
  }

  override setSize(baseWidth: number, baseHeight: number): void {
    const resolution = this.resolution
    resolution.setBaseSize(baseWidth, baseHeight)

    const { width, height } = resolution
    if (this.temporalUpscaling) {
      const w = Math.ceil(width / 4)
      const h = Math.ceil(height / 4)
      this.cloudsRenderTarget.setSize(w, h)
      this.cloudsMaterial.setSize(w * 4, h * 4)
    } else {
      this.cloudsRenderTarget.setSize(width, height)
      this.cloudsMaterial.setSize(width, height)
    }

    this.cloudsResolveRenderTarget.setSize(width, height)
    this.cloudsResolveMaterial.setSize(width, height)
    this.cloudsHistoryRenderTarget.setSize(width, height)

    this.shadowMaterial.copyCameraSettings(this.camera)
    this.cloudsMaterial.copyCameraSettings(this.camera)
    this.copyShadowParameters()
  }

  override setDepthTexture(
    depthTexture: Texture,
    depthPacking?: DepthPackingStrategies
  ): void {
    this.cloudsMaterial.depthBuffer = depthTexture
    this.cloudsMaterial.depthPacking = depthPacking ?? 0
  }

  get temporalUpscaling(): boolean {
    return this.cloudsMaterial.temporalUpscaling
  }

  set temporalUpscaling(value: boolean) {
    if (value !== this.temporalUpscaling) {
      this.cloudsMaterial.temporalUpscaling = value
      this.cloudsResolveMaterial.temporalUpscaling = value
      this.setSize(this.resolution.baseWidth, this.resolution.baseHeight)
    }
  }

  get shadowLength(): boolean {
    return this.cloudsMaterial.shadowLength
  }

  set shadowLength(value: boolean) {
    if (value !== this.shadowLength) {
      this.cloudsMaterial.shadowLength = value
      this.cloudsResolveMaterial.shadowLength = value
      this.initCloudsRenderTargets({
        depthVelocity: true,
        shadowLength: value
      })
      this.setSize(this.resolution.baseWidth, this.resolution.baseHeight)
    }
  }

  // Textures

  get stbnTexture(): Data3DTexture | null {
    return this.cloudsMaterial.uniforms.stbnTexture.value
  }

  set stbnTexture(value: Data3DTexture | null) {
    this.shadowMaterial.uniforms.stbnTexture.value = value
    this.cloudsMaterial.uniforms.stbnTexture.value = value
  }

  // Cloud parameters

  get coverage(): number {
    return this.cloudsMaterial.uniforms.coverage.value
  }

  set coverage(value: number) {
    this.shadowMaterial.uniforms.coverage.value = value
    this.cloudsMaterial.uniforms.coverage.value = value
  }

  // Atmosphere composition accessors

  get cloudsBuffer(): Texture {
    return this.cloudsResolveRenderTarget.texture
  }

  get shadowBuffer(): DataArrayTexture {
    return this.shadowResolveRenderTarget.texture
  }

  get shadowIntervals(): Vector2[] {
    return this.cloudsMaterial.uniforms.shadowIntervals.value
  }

  get shadowMatrices(): Matrix4[] {
    return this.cloudsMaterial.uniforms.shadowMatrices.value
  }

  get shadowTopHeight(): number {
    return this.cloudsMaterial.uniforms.shadowTopHeight.value
  }

  get shadowLengthBuffer(): Texture | null {
    return this.cloudsResolveRenderTarget.shadowLength
  }

  // Atmosphere parameters

  get irradianceTexture(): DataTexture | null {
    return this.cloudsMaterial.irradianceTexture
  }

  set irradianceTexture(value: DataTexture | null) {
    this.cloudsMaterial.irradianceTexture = value
  }

  get scatteringTexture(): Data3DTexture | null {
    return this.cloudsMaterial.scatteringTexture
  }

  set scatteringTexture(value: Data3DTexture | null) {
    this.cloudsMaterial.scatteringTexture = value
  }

  get transmittanceTexture(): DataTexture | null {
    return this.cloudsMaterial.transmittanceTexture
  }

  set transmittanceTexture(value: DataTexture | null) {
    this.cloudsMaterial.transmittanceTexture = value
  }

  get useHalfFloat(): boolean {
    return this.cloudsMaterial.useHalfFloat
  }

  set useHalfFloat(value: boolean) {
    this.cloudsMaterial.useHalfFloat = value
  }

  get ellipsoid(): Ellipsoid {
    return this.cloudsMaterial.ellipsoid
  }

  set ellipsoid(value: Ellipsoid) {
    this.cloudsMaterial.ellipsoid = value
    this.shadowMaterial.ellipsoid = value
  }

  get correctAltitude(): boolean {
    return this.cloudsMaterial.correctAltitude
  }

  set correctAltitude(value: boolean) {
    this.cloudsMaterial.correctAltitude = value
    this.shadowMaterial.correctAltitude = value
  }

  get photometric(): boolean {
    return this.cloudsMaterial.photometric
  }

  set photometric(value: boolean) {
    this.cloudsMaterial.photometric = value
  }

  get sunAngularRadius(): number {
    return this.cloudsMaterial.sunAngularRadius
  }

  set sunAngularRadius(value: number) {
    this.cloudsMaterial.sunAngularRadius = value
  }
}
