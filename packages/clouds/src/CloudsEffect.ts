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

import { ArrayCopyPass } from './ArrayCopyPass'
import { CascadedShadowMaps } from './CascadedShadowMaps'
import { CloudShape } from './CloudShape'
import { CloudShapeDetail } from './CloudShapeDetail'
import { CloudsHistoryMaterial } from './CloudsHistoryMaterial'
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
      maxHeight: 1600,
      extinctionCoeff: 0.5,
      detailAmount: 1,
      weatherExponent: 1,
      coverageFilterWidth: 0.6
    },
    {
      minHeight: 0,
      maxHeight: 0,
      extinctionCoeff: 0,
      detailAmount: 0,
      weatherExponent: 1,
      coverageFilterWidth: 0.0
    },
    {
      minHeight: 7500,
      maxHeight: 8000,
      extinctionCoeff: 0.005,
      detailAmount: 0.4,
      weatherExponent: 1,
      coverageFilterWidth: 0.5
    },
    {
      minHeight: 0,
      maxHeight: 0,
      extinctionCoeff: 0,
      detailAmount: 0,
      weatherExponent: 1,
      coverageFilterWidth: 0.0
    }
  ]

  // Shared references
  readonly ellipsoidCenter: Vector3
  readonly ellipsoidMatrix: Matrix4
  readonly sunDirection: Vector3

  // Atmosphere, weather and shape
  readonly localWeather: LocalWeather
  readonly localWeatherVelocity = new Vector2()
  readonly shape: CloudShape
  readonly shapeVelocity = new Vector3()
  readonly shapeDetail: CloudShapeDetail
  readonly shapeDetailVelocity = new Vector3()

  // Beer shadow map
  readonly shadow: CascadedShadowMaps
  readonly shadowRenderTarget: WebGLArrayRenderTarget
  readonly shadowMaterial: ShadowMaterial
  readonly shadowPass: ShaderArrayPass
  readonly shadowResolveRenderTarget: WebGLArrayRenderTarget
  readonly shadowResolveMaterial: ShadowResolveMaterial
  readonly shadowResolvePass: ShaderArrayPass
  readonly shadowHistoryPass: ArrayCopyPass

  // Clouds
  cloudsRenderTarget!: CloudsRenderTarget
  readonly cloudsMaterial: CloudsMaterial
  readonly cloudsPass: ShaderPass
  cloudsResolveRenderTarget!: CloudsRenderTarget
  readonly cloudsResolveMaterial: CloudsResolveMaterial
  readonly cloudsResolvePass: ShaderPass
  cloudsHistoryRenderTarget!: CloudsRenderTarget
  readonly cloudsHistoryMaterial: CloudsHistoryMaterial
  readonly cloudsHistoryPass: ShaderPass

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

    const localWeather = new LocalWeather()
    const shape = new CloudShape()
    const shapeDetail = new CloudShapeDetail()

    const shadowRenderTarget = createShadowRenderTarget('Shadow.Current')
    const shadowResolveRenderTarget = createShadowRenderTarget('Shadow.Resolve')

    // These instances are shared by both cloud and shadow materials.
    const ellipsoidCenter = new Vector3()
    const ellipsoidMatrix = new Matrix4()
    const sunDirection = new Vector3()

    const shadowMaterial = new ShadowMaterial(
      {
        ellipsoidCenterRef: ellipsoidCenter,
        ellipsoidMatrixRef: ellipsoidMatrix,
        sunDirectionRef: sunDirection,
        localWeatherTexture: localWeather.texture,
        shapeTexture: shape.texture,
        shapeDetailTexture: shapeDetail.texture
      },
      atmosphere
    )
    const shadowPass = new ShaderArrayPass(shadowMaterial)
    const shadowHistoryPass = new ArrayCopyPass()
    const shadowResolveMaterial = new ShadowResolveMaterial({
      inputBuffer: shadowRenderTarget.texture,
      historyBuffer: shadowHistoryPass.texture
    })
    const shadowResolvePass = new ShaderArrayPass(shadowResolveMaterial)

    const cloudsMaterial = new CloudsMaterial(
      {
        ellipsoidCenterRef: ellipsoidCenter,
        ellipsoidMatrixRef: ellipsoidMatrix,
        sunDirectionRef: sunDirection,
        localWeatherTexture: localWeather.texture,
        shapeTexture: shape.texture,
        shapeDetailTexture: shapeDetail.texture,
        shadowBuffer: shadowResolveRenderTarget.texture
      },
      atmosphere
    )

    super('CloudsEffect', fragmentShader, {
      attributes: EffectAttribute.DEPTH
    })

    // Shared references
    this.ellipsoidCenter = ellipsoidCenter
    this.ellipsoidMatrix = ellipsoidMatrix
    this.sunDirection = sunDirection

    // Atmosphere, weather and shape
    this.localWeather = localWeather
    this.shape = shape
    this.shapeDetail = shapeDetail

    // Beer shadow map
    this.shadow = new CascadedShadowMaps({
      cascadeCount: 3,
      mapSize: new Vector2().setScalar(512),
      splitLambda: 0.6
    })
    this.shadowRenderTarget = shadowRenderTarget
    this.shadowMaterial = shadowMaterial
    this.shadowPass = shadowPass
    this.shadowResolveRenderTarget = shadowResolveRenderTarget
    this.shadowResolveMaterial = shadowResolveMaterial
    this.shadowResolvePass = shadowResolvePass
    this.shadowHistoryPass = shadowHistoryPass

    // Clouds
    this.cloudsMaterial = cloudsMaterial
    this.cloudsPass = new ShaderPass(cloudsMaterial)
    this.cloudsResolveMaterial = new CloudsResolveMaterial()
    this.cloudsResolvePass = new ShaderPass(this.cloudsResolveMaterial)
    this.cloudsHistoryMaterial = new CloudsHistoryMaterial()
    this.cloudsHistoryPass = new ShaderPass(this.cloudsHistoryMaterial)
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

  private initCloudsRenderTargets({
    depthVelocity,
    shadowLength
  }: CloudsRenderTargetOptions): void {
    this.cloudsRenderTarget?.dispose()
    this.cloudsResolveRenderTarget?.dispose()
    this.cloudsHistoryRenderTarget?.dispose()

    const current = createCloudsRenderTarget('Clouds.Current', {
      depthVelocity,
      shadowLength
    })
    const resolve = createCloudsRenderTarget('Clouds.Resolve', {
      depthVelocity: false,
      shadowLength
    })
    const history = createCloudsRenderTarget('Clouds.History', {
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

    const historyUniforms = this.cloudsHistoryMaterial.uniforms
    historyUniforms.colorBuffer.value = resolve.texture
    historyUniforms.shadowLengthBuffer.value = resolve.shadowLength
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
    this.shadowHistoryPass.initialize(renderer, alpha, frameBufferType)
    this.cloudsPass.initialize(renderer, alpha, frameBufferType)
    this.cloudsResolvePass.initialize(renderer, alpha, frameBufferType)
    this.cloudsHistoryPass.initialize(renderer, alpha, frameBufferType)
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
      this.shadowHistoryPass.setSize(width, height, depth)
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

  private copyReprojectionParameters(): void {
    const shadow = this.shadow
    const shadowUniforms = this.shadowMaterial.uniforms
    for (let i = 0; i < shadow.cascadeCount; ++i) {
      const cascade = shadow.cascades[i]
      shadowUniforms.reprojectionMatrices.value[i].copy(cascade.matrix)
    }
    this.cloudsMaterial.copyReprojectionMatrix(this.camera)
  }

  override update(
    renderer: WebGLRenderer,
    inputBuffer: WebGLRenderTarget,
    deltaTime = 0
  ): void {
    this.updateShadowMap()
    this.localWeather.update(renderer)
    this.shape.update(renderer)
    this.shapeDetail.update(renderer)

    // Update uniforms.
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

    // Render beer shadow map.
    const shadowResolveRenderTarget = this.shadowResolveRenderTarget
    this.shadowPass.render(renderer, null, this.shadowRenderTarget)
    this.shadowResolvePass.render(renderer, null, shadowResolveRenderTarget)
    this.shadowHistoryPass.render(renderer, shadowResolveRenderTarget, null)

    // Render clouds.
    // TODO: Attempts have been made to use WebGLRenderer.copyTextureToTexture()
    // instead of CopyPass, but none have been successful so far.
    this.cloudsPass.render(renderer, null, this.cloudsRenderTarget)
    this.cloudsResolvePass.render(
      renderer,
      null,
      this.cloudsResolveRenderTarget
    )
    this.cloudsHistoryPass.render(
      renderer,
      null,
      this.cloudsHistoryRenderTarget
    )

    // Store the current view and projection matrices for the next reprojection.
    this.copyReprojectionParameters()
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
      this.cloudsHistoryMaterial.shadowLength = value
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
    return this.cloudLayers[0].maxHeight
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
