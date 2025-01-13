import {
  BlendFunction,
  CopyPass,
  Effect,
  EffectAttribute,
  Resolution,
  ShaderPass
} from 'postprocessing'
import {
  Camera,
  HalfFloatType,
  LinearFilter,
  NearestFilter,
  Vector2,
  Vector3,
  WebGLArrayRenderTarget,
  WebGLRenderTarget,
  type Data3DTexture,
  type DataArrayTexture,
  type DataTexture,
  type DepthPackingStrategies,
  type Event,
  type Matrix4,
  type PerspectiveCamera,
  type Texture,
  type TextureDataType,
  type WebGLRenderer
} from 'three'

import { AtmosphereParameters } from '@takram/three-atmosphere'
import { assertType, type Ellipsoid } from '@takram/three-geospatial'

import { CascadedShadows } from './CascadedShadows'
import { CloudShape } from './CloudShape'
import { CloudShapeDetail } from './CloudShapeDetail'
import { CloudsMaterial } from './CloudsMaterial'
import { CloudsResolveMaterial } from './CloudsResolveMaterial'
import { CopyArrayPass } from './CopyArrayPass'
import { LocalWeather } from './LocalWeather'
import { ShaderArrayPass } from './ShaderArrayPass'
import { ShadowFilterPass } from './ShadowFilterPass'
import { ShadowMaterial } from './ShadowMaterial'
import { ShadowResolveMaterial } from './ShadowResolveMaterial'
import { updateCloudLayerUniforms, type CloudLayers } from './uniforms'

import fragmentShader from './shaders/cloudsEffect.frag?raw'

const vectorScratch = /*#__PURE__*/ new Vector3()

function createRenderTarget(name: string): WebGLRenderTarget {
  const renderTarget = new WebGLRenderTarget(1, 1, {
    depthBuffer: false,
    stencilBuffer: false,
    type: HalfFloatType
  })
  renderTarget.texture.name = name
  return renderTarget
}

function createArrayRenderTarget(name: string): WebGLArrayRenderTarget {
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
  blendFunction?: BlendFunction
  resolutionScale?: number
  width?: number
  height?: number
  resolutionX?: number
  resolutionY?: number
}

export const cloudsEffectOptionsDefaults = {
  blendFunction: BlendFunction.NORMAL,
  resolutionScale: 1,
  width: Resolution.AUTO_SIZE,
  height: Resolution.AUTO_SIZE
} satisfies CloudsEffectOptions

export class CloudsEffect extends Effect {
  readonly cloudLayers: CloudLayers = [
    {
      minHeight: 750,
      maxHeight: 1600,
      extinctionCoeff: 0.3,
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
      minHeight: 6700,
      maxHeight: 8000,
      extinctionCoeff: 0.005,
      detailAmount: 0.3,
      weatherExponent: 3,
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

  readonly sunDirection: Vector3
  readonly localWeather: LocalWeather
  readonly localWeatherVelocity = new Vector2()
  readonly shape: CloudShape
  readonly shapeVelocity = new Vector3()
  readonly shapeDetail: CloudShapeDetail
  readonly shapeDetailVelocity = new Vector3()

  private readonly cascadedShadows: CascadedShadows

  readonly shadowRenderTarget: WebGLArrayRenderTarget
  readonly shadowMaterial: ShadowMaterial
  readonly shadowPass: ShaderArrayPass
  readonly shadowHistoryRenderTarget: WebGLArrayRenderTarget
  readonly shadowHistoryPass: CopyArrayPass
  readonly shadowResolveRenderTarget: WebGLArrayRenderTarget
  readonly shadowResolveMaterial: ShadowResolveMaterial
  readonly shadowResolvePass: ShaderArrayPass
  readonly shadowFilterPass: ShadowFilterPass

  readonly cloudsRenderTarget: WebGLRenderTarget
  readonly cloudsMaterial: CloudsMaterial
  readonly cloudsPass: ShaderPass
  readonly cloudsHistoryRenderTarget: WebGLRenderTarget
  readonly cloudsHistoryPass: CopyPass
  readonly cloudsResolveRenderTarget: WebGLRenderTarget
  readonly cloudsResolveMaterial: CloudsResolveMaterial
  readonly cloudsResolvePass: ShaderPass

  readonly resolution: Resolution

  private frame = 0
  private _shadowCascadeCount = 0
  private _shadowMapSize = new Vector2()

  constructor(
    private camera: Camera = new Camera(),
    options?: CloudsEffectOptions,
    atmosphere = AtmosphereParameters.DEFAULT
  ) {
    const {
      blendFunction,
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

    const shadowRenderTarget = createArrayRenderTarget('Shadow.Current')
    const shadowHistoryRenderTarget = createArrayRenderTarget('Shadow.History')
    const shadowResolveRenderTarget = createArrayRenderTarget('Shadow.Resolve')

    const cloudsRenderTarget = createRenderTarget('Clouds.Current')
    const cloudsDepthVelocityBuffer = cloudsRenderTarget.texture.clone()
    cloudsDepthVelocityBuffer.isRenderTargetTexture = true
    cloudsDepthVelocityBuffer.minFilter = NearestFilter
    cloudsDepthVelocityBuffer.magFilter = NearestFilter
    cloudsRenderTarget.textures.push(cloudsDepthVelocityBuffer)
    const cloudsHistoryRenderTarget = createRenderTarget('Clouds.History')
    const cloudsResolveRenderTarget = createRenderTarget('Clouds.Resolve')

    // This instance is shared between clouds and shadow materials.
    const sunDirection = new Vector3()

    const cascadedShadows = new CascadedShadows({
      lambda: 0.6,
      far: 1e5 // TODO: Parametrize
    })
    const shadowMaterial = new ShadowMaterial(
      {
        sunDirectionRef: sunDirection,
        localWeatherTexture: localWeather.texture,
        shapeTexture: shape.texture,
        shapeDetailTexture: shapeDetail.texture
      },
      atmosphere
    )
    const shadowResolveMaterial = new ShadowResolveMaterial({
      inputBuffer: shadowRenderTarget.texture,
      historyBuffer: shadowHistoryRenderTarget.texture
    })
    const cloudsMaterial = new CloudsMaterial(
      {
        sunDirectionRef: sunDirection,
        localWeatherTexture: localWeather.texture,
        shapeTexture: shape.texture,
        shapeDetailTexture: shapeDetail.texture,
        shadowBuffer: shadowResolveRenderTarget.texture
      },
      atmosphere
    )
    const cloudsResolveMaterial = new CloudsResolveMaterial({
      inputBuffer: cloudsRenderTarget.texture,
      depthVelocityBuffer: cloudsDepthVelocityBuffer,
      historyBuffer: cloudsHistoryRenderTarget.texture
    })

    const shadowPass = new ShaderArrayPass(shadowMaterial)
    const shadowHistoryPass = new CopyArrayPass(shadowHistoryRenderTarget)
    const shadowResolvePass = new ShaderArrayPass(shadowResolveMaterial)
    const shadowFilterPass = new ShadowFilterPass({ kernelSize: 16 })

    const cloudsPass = new ShaderPass(cloudsMaterial)
    const cloudsHistoryPass = new CopyPass(cloudsHistoryRenderTarget)
    const cloudsResolvePass = new ShaderPass(cloudsResolveMaterial)

    super('CloudsEffect', fragmentShader, {
      blendFunction,
      attributes: EffectAttribute.DEPTH
    })

    this.sunDirection = sunDirection
    this.localWeather = localWeather
    this.shape = shape
    this.shapeDetail = shapeDetail
    this.cascadedShadows = cascadedShadows

    this.shadowRenderTarget = shadowRenderTarget
    this.shadowMaterial = shadowMaterial
    this.shadowPass = shadowPass
    this.shadowHistoryRenderTarget = shadowHistoryRenderTarget
    this.shadowHistoryPass = shadowHistoryPass
    this.shadowResolveRenderTarget = shadowResolveRenderTarget
    this.shadowResolveMaterial = shadowResolveMaterial
    this.shadowResolvePass = shadowResolvePass
    this.shadowFilterPass = shadowFilterPass

    this.cloudsRenderTarget = cloudsRenderTarget
    this.cloudsMaterial = cloudsMaterial
    this.cloudsPass = cloudsPass
    this.cloudsHistoryRenderTarget = cloudsHistoryRenderTarget
    this.cloudsHistoryPass = cloudsHistoryPass
    this.cloudsResolveRenderTarget = cloudsResolveRenderTarget
    this.cloudsResolveMaterial = cloudsResolveMaterial
    this.cloudsResolvePass = cloudsResolvePass

    // Camera needs to be set after setting up the pass.
    this.mainCamera = camera

    // Initialize aggregated default values.
    this.shadowCascadeCount = 3
    this.shadowMapSize = new Vector2(1024, 1024)

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
    this.shadowMaterial.copyCameraSettings(value)
    this.cloudsMaterial.copyCameraSettings(value)
    this.cloudsResolveMaterial.copyCameraSettings(value)
  }

  override initialize(
    renderer: WebGLRenderer,
    alpha: boolean,
    frameBufferType: TextureDataType
  ): void {
    this.shadowPass.initialize(renderer, alpha, frameBufferType)
    this.shadowHistoryPass.initialize(renderer, alpha, frameBufferType)
    this.shadowResolvePass.initialize(renderer, alpha, frameBufferType)
    this.shadowFilterPass.initialize(renderer, alpha, frameBufferType)
    this.cloudsPass.initialize(renderer, alpha, frameBufferType)
    this.cloudsHistoryPass.initialize(renderer, alpha, frameBufferType)
    this.cloudsResolvePass.initialize(renderer, alpha, frameBufferType)
  }

  updateShadowMatrices(): void {
    const camera = this.mainCamera
    assertType<PerspectiveCamera>(camera)
    const shadows = this.cascadedShadows
    shadows.update(camera, this.sunDirection, this.ellipsoid)

    const shadowUniforms = this.shadowMaterial.uniforms
    const cloudsUniforms = this.cloudsMaterial.uniforms
    for (let i = 0; i < shadows.cascadeCount; ++i) {
      const cascade = shadows.cascades[i]
      shadowUniforms.inverseShadowMatrices.value[i].copy(cascade.inverseMatrix)
      cloudsUniforms.shadowIntervals.value[i].copy(cascade.interval)
      cloudsUniforms.shadowMatrices.value[i].copy(cascade.matrix)
    }
    cloudsUniforms.shadowFar.value = shadows.far
  }

  setReprojectionMatrices(): void {
    const shadows = this.cascadedShadows
    const shadowUniforms = this.shadowMaterial.uniforms
    const shadowResolveUniforms = this.shadowResolveMaterial.uniforms
    for (let i = 0; i < shadows.cascadeCount; ++i) {
      const cascade = shadows.cascades[i]
      shadowUniforms.reprojectionMatrices.value[i].copy(cascade.matrix)
      shadowResolveUniforms.reprojectionMatrices.value[i].copy(cascade.matrix)
    }

    this.cloudsMaterial.setReprojectionMatrix(this.camera)
    this.cloudsResolveMaterial.setReprojectionMatrix(this.camera)
  }

  override update(
    renderer: WebGLRenderer,
    inputBuffer: WebGLRenderTarget,
    deltaTime = 0
  ): void {
    this.localWeather.update(renderer)
    this.shape.update(renderer)
    this.shapeDetail.update(renderer)

    ++this.frame
    const shadowUniforms = this.shadowMaterial.uniforms
    const cloudsUniforms = this.cloudsMaterial.uniforms
    updateCloudLayerUniforms(shadowUniforms, this.cloudLayers)
    updateCloudLayerUniforms(cloudsUniforms, this.cloudLayers)
    shadowUniforms.frame.value = this.frame
    cloudsUniforms.frame.value = this.frame

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

    this.shadowMaterial.copyCameraSettings(this.camera)
    this.cloudsMaterial.copyCameraSettings(this.camera)
    this.cloudsResolveMaterial.copyCameraSettings(this.camera)
    this.updateShadowMatrices()

    this.shadowPass.render(renderer, null, this.shadowRenderTarget)
    this.shadowResolvePass.render(
      renderer,
      null,
      this.shadowResolveRenderTarget
    )
    this.shadowHistoryPass.render(
      renderer,
      this.shadowResolveRenderTarget,
      null
    )
    this.shadowFilterPass.render(
      renderer,
      this.shadowResolveRenderTarget,
      this.shadowResolveRenderTarget
    )

    this.cloudsPass.render(renderer, null, this.cloudsRenderTarget)
    this.cloudsResolvePass.render(
      renderer,
      null,
      this.cloudsResolveRenderTarget
    )
    this.cloudsHistoryPass.render(
      renderer,
      this.cloudsResolveRenderTarget,
      null
    )

    this.setReprojectionMatrices()
  }

  override setSize(width: number, height: number): void {
    const resolution = this.resolution
    resolution.setBaseSize(width, height)

    const { width: scaledWidth, height: scaledHeight } = resolution
    this.cloudsRenderTarget.setSize(scaledWidth, scaledHeight)
    this.cloudsMaterial.setSize(scaledWidth, scaledHeight)
    this.cloudsHistoryRenderTarget.setSize(scaledWidth, scaledHeight)
    this.cloudsResolveRenderTarget.setSize(scaledWidth, scaledHeight)
    this.cloudsResolveMaterial.setSize(scaledWidth, scaledHeight)

    this.shadowMaterial.copyCameraSettings(this.camera)
    this.cloudsMaterial.copyCameraSettings(this.camera)
    this.cloudsResolveMaterial.copyCameraSettings(this.camera)
    this.updateShadowMatrices()

    // Reset reprojection matrices.
    this.cloudsMaterial.setReprojectionMatrix(this.camera)
    this.cloudsResolveMaterial.setReprojectionMatrix(this.camera)
  }

  override setDepthTexture(
    depthTexture: Texture,
    depthPacking?: DepthPackingStrategies
  ): void {
    this.shadowMaterial.depthBuffer = depthTexture
    this.cloudsMaterial.depthBuffer = depthTexture
    this.shadowMaterial.depthPacking = depthPacking ?? 0
    this.cloudsMaterial.depthPacking = depthPacking ?? 0
  }

  // Textures

  get stbnScalarTexture(): Data3DTexture | null {
    return this.cloudsMaterial.uniforms.stbnScalarTexture.value
  }

  set stbnScalarTexture(value: Data3DTexture | null) {
    this.shadowMaterial.uniforms.stbnScalarTexture.value = value
    this.cloudsMaterial.uniforms.stbnScalarTexture.value = value
  }

  get stbnVec2Texture(): Data3DTexture | null {
    return this.cloudsMaterial.uniforms.stbnVec2Texture.value
  }

  set stbnVec2Texture(value: Data3DTexture | null) {
    this.cloudsMaterial.uniforms.stbnVec2Texture.value = value
  }

  // Cloud parameters

  get coverage(): number {
    return this.cloudsMaterial.uniforms.coverage.value
  }

  set coverage(value: number) {
    this.shadowMaterial.uniforms.coverage.value = value
    this.cloudsMaterial.uniforms.coverage.value = value
  }

  // Shadow parameters

  get shadowCascadeCount(): number {
    return this._shadowCascadeCount
  }

  set shadowCascadeCount(value: number) {
    if (value !== this.shadowCascadeCount) {
      this._shadowCascadeCount = value

      this.cascadedShadows.cascadeCount = value
      this.shadowMaterial.cascadeCount = value
      this.shadowResolveMaterial.cascadeCount = value
      this.cloudsMaterial.shadowCascadeCount = value

      const { width, height } = this.shadowMapSize
      this.shadowRenderTarget.setSize(width, height, value * 2) // For velocity
      this.shadowHistoryRenderTarget.setSize(width, height, value)
      this.shadowResolveRenderTarget.setSize(width, height, value)
      this.shadowFilterPass.setSize(width, height, value)
    }
  }

  get shadowMapSize(): Vector2 {
    return this._shadowMapSize
  }

  set shadowMapSize(value: Vector2) {
    if (!this.shadowMapSize.equals(value)) {
      this._shadowMapSize = value

      const { width, height } = value
      this.cascadedShadows.mapSize.set(width, height)
      this.shadowMaterial.setSize(width, height)
      this.shadowResolveMaterial.setSize(width, height)
      this.cloudsMaterial.setShadowSize(width, height)

      const depth = this.shadowCascadeCount
      this.shadowRenderTarget.setSize(width, height, depth * 2) // For velocity
      this.shadowHistoryRenderTarget.setSize(width, height, depth)
      this.shadowResolveRenderTarget.setSize(width, height, depth)
      this.shadowFilterPass.setSize(width, height, depth)
    }
  }

  // Shadow composition accessors

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

  get shadowFar(): number {
    return this.cascadedShadows.far
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
