import {
  BlendFunction,
  Effect,
  EffectAttribute,
  Resolution,
  ShaderPass
} from 'postprocessing'
import {
  Camera,
  HalfFloatType,
  LinearFilter,
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
import { CloudsShadowMaterial } from './CloudsShadowMaterial'
import { CloudsShadowResolveMaterial } from './CloudsShadowResolveMaterial'
import { CopyArrayPass } from './CopyArrayPass'
import { LocalWeather } from './LocalWeather'
import { ShaderArrayPass } from './ShaderArrayPass'
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
  readonly cloudsRenderTarget: WebGLRenderTarget
  readonly cloudsMaterial: CloudsMaterial
  readonly cloudsPass: ShaderPass
  readonly shadowRenderTarget: WebGLArrayRenderTarget
  readonly shadowMaterial: CloudsShadowMaterial
  readonly shadowPass: ShaderArrayPass
  readonly shadowHistoryRenderTarget: WebGLArrayRenderTarget
  readonly shadowHistoryPass: CopyArrayPass
  readonly shadowResolveRenderTarget: WebGLArrayRenderTarget
  readonly shadowResolveMaterial: CloudsShadowResolveMaterial
  readonly shadowResolvePass: ShaderArrayPass
  readonly resolution: Resolution

  private frame = 0
  private _shadowMapSize = 0
  private _shadowCascadeCount = 0

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

    const cloudsRenderTarget = createRenderTarget('Clouds')
    const shadowRenderTarget = createArrayRenderTarget('Shadow')
    const shadowHistoryRenderTarget = createArrayRenderTarget('ShadowHistory')
    const shadowResolveRenderTarget = createArrayRenderTarget('ShadowResolve')

    // This instance is shared between clouds and shadow materials.
    const sunDirection = new Vector3()

    const cascadedShadows = new CascadedShadows({
      lambda: 0.6,
      far: 1e5 // TODO: Parametrize
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
    const shadowMaterial = new CloudsShadowMaterial(
      {
        sunDirectionRef: sunDirection,
        localWeatherTexture: localWeather.texture,
        shapeTexture: shape.texture,
        shapeDetailTexture: shapeDetail.texture
      },
      atmosphere
    )
    const shadowResolveMaterial = new CloudsShadowResolveMaterial({
      inputBuffer: shadowRenderTarget.texture,
      historyBuffer: shadowHistoryRenderTarget.texture
    })

    const cloudsPass = new ShaderPass(cloudsMaterial)
    const shadowPass = new ShaderArrayPass(shadowMaterial)
    const shadowHistoryPass = new CopyArrayPass(shadowHistoryRenderTarget)
    const shadowResolvePass = new ShaderArrayPass(shadowResolveMaterial)

    super('CloudsEffect', fragmentShader, {
      blendFunction,
      attributes: EffectAttribute.DEPTH
    })

    this.sunDirection = sunDirection
    this.localWeather = localWeather
    this.shape = shape
    this.shapeDetail = shapeDetail
    this.cascadedShadows = cascadedShadows
    this.cloudsRenderTarget = cloudsRenderTarget
    this.cloudsMaterial = cloudsMaterial
    this.cloudsPass = cloudsPass
    this.shadowRenderTarget = shadowRenderTarget
    this.shadowMaterial = shadowMaterial
    this.shadowPass = shadowPass
    this.shadowHistoryRenderTarget = shadowHistoryRenderTarget
    this.shadowHistoryPass = shadowHistoryPass
    this.shadowResolveRenderTarget = shadowResolveRenderTarget
    this.shadowResolveMaterial = shadowResolveMaterial
    this.shadowResolvePass = shadowResolvePass

    // Camera needs to be set after setting up the pass.
    this.mainCamera = camera

    // Initialize aggregated default values.
    this.shadowMapSize = 1024
    this.shadowCascadeCount = 3

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
    this.cloudsMaterial.copyCameraSettings(value)
    this.shadowMaterial.copyCameraSettings(value)
  }

  override initialize(
    renderer: WebGLRenderer,
    alpha: boolean,
    frameBufferType: TextureDataType
  ): void {
    this.cloudsPass.initialize(renderer, alpha, frameBufferType)
    this.shadowPass.initialize(renderer, alpha, frameBufferType)
    this.shadowHistoryPass.initialize(renderer, alpha, frameBufferType)
    this.shadowResolvePass.initialize(renderer, alpha, frameBufferType)
  }

  updateShadowMatrix(): void {
    const camera = this.mainCamera
    assertType<PerspectiveCamera>(camera)
    const shadows = this.cascadedShadows
    shadows.update(camera, this.sunDirection, this.ellipsoid)

    const shadowUniforms = this.shadowMaterial.uniforms
    const cloudsUniforms = this.cloudsMaterial.uniforms
    for (let i = 0; i < shadows.cascadeCount; ++i) {
      const cascade = shadows.cascades[i]
      cloudsUniforms.shadowIntervals.value[i].copy(cascade.interval)
      cloudsUniforms.shadowMatrices.value[i].copy(cascade.matrix)
      shadowUniforms.inverseShadowMatrices.value[i].copy(cascade.inverseMatrix)
    }
    cloudsUniforms.shadowFar.value = shadows.far
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
    const cloudsUniforms = this.cloudsMaterial.uniforms
    const shadowUniforms = this.shadowMaterial.uniforms
    updateCloudLayerUniforms(cloudsUniforms, this.cloudLayers)
    updateCloudLayerUniforms(shadowUniforms, this.cloudLayers)
    cloudsUniforms.frame.value = this.frame
    shadowUniforms.frame.value = this.frame

    applyVelocity(
      this.localWeatherVelocity,
      deltaTime,
      cloudsUniforms.localWeatherOffset.value,
      shadowUniforms.localWeatherOffset.value
    )
    applyVelocity(
      this.shapeVelocity,
      deltaTime,
      cloudsUniforms.shapeOffset.value,
      shadowUniforms.shapeOffset.value
    )
    applyVelocity(
      this.localWeatherVelocity,
      deltaTime,
      cloudsUniforms.shapeDetailOffset.value,
      shadowUniforms.shapeDetailOffset.value
    )

    this.cloudsMaterial.copyCameraSettings(this.camera)
    this.shadowMaterial.copyCameraSettings(this.camera)
    this.updateShadowMatrix()

    this.shadowPass.render(renderer, null, this.shadowRenderTarget)
    this.shadowResolvePass.render(
      renderer,
      this.shadowRenderTarget,
      this.shadowResolveRenderTarget
    )
    this.shadowHistoryPass.render(
      renderer,
      this.shadowResolveRenderTarget,
      null
    )
    this.cloudsPass.render(renderer, null, this.cloudsRenderTarget)
  }

  override setSize(width: number, height: number): void {
    const resolution = this.resolution
    resolution.setBaseSize(width, height)

    const { width: scaleWidth, height: scaleHeight } = resolution
    this.cloudsRenderTarget.setSize(scaleWidth, scaleHeight)
    this.cloudsMaterial.setSize(scaleWidth, scaleHeight)

    this.cloudsMaterial.copyCameraSettings(this.camera)
    this.shadowMaterial.copyCameraSettings(this.camera)
    this.updateShadowMatrix()
  }

  override setDepthTexture(
    depthTexture: Texture,
    depthPacking?: DepthPackingStrategies
  ): void {
    this.cloudsMaterial.depthBuffer = depthTexture
    this.shadowMaterial.depthBuffer = depthTexture
    this.cloudsMaterial.depthPacking = depthPacking ?? 0
    this.shadowMaterial.depthPacking = depthPacking ?? 0
  }

  // Textures

  get blueNoiseTexture(): Data3DTexture | null {
    return this.cloudsMaterial.uniforms.blueNoiseTexture.value
  }

  set blueNoiseTexture(value: Data3DTexture | null) {
    this.cloudsMaterial.uniforms.blueNoiseTexture.value = value
    this.shadowMaterial.uniforms.blueNoiseTexture.value = value
  }

  // Cloud parameters

  get coverage(): number {
    return this.cloudsMaterial.uniforms.coverage.value
  }

  set coverage(value: number) {
    this.cloudsMaterial.uniforms.coverage.value = value
    this.shadowMaterial.uniforms.coverage.value = value
  }

  // Shadow parameters

  get shadowMapSize(): number {
    return this._shadowMapSize
  }

  set shadowMapSize(value: number) {
    if (value !== this.shadowMapSize) {
      this._shadowMapSize = value

      const { depth } = this.shadowRenderTarget
      this.shadowRenderTarget.setSize(value, value, depth)
      this.shadowHistoryRenderTarget.setSize(value, value, depth)
      this.shadowResolveRenderTarget.setSize(value, value, depth)
      this.cascadedShadows.cascadeSize = value
      this.cloudsMaterial.uniforms.shadowTexelSize.value.setScalar(1 / value)
      this.shadowMaterial.setSize(value, value)
    }
  }

  get shadowCascadeCount(): number {
    return this._shadowCascadeCount
  }

  set shadowCascadeCount(value: number) {
    if (value !== this.shadowCascadeCount) {
      this._shadowCascadeCount = value

      const { width, height } = this.shadowRenderTarget
      this.shadowRenderTarget.setSize(width, height, value)
      this.shadowHistoryRenderTarget.setSize(width, height, value)
      this.shadowResolveRenderTarget.setSize(width, height, value)
      this.cascadedShadows.cascadeCount = value
      this.cloudsMaterial.shadowCascadeCount = value
      this.shadowMaterial.cascadeCount = value
      this.shadowHistoryPass.layerCount = value
      this.shadowResolveMaterial.cascadeCount = value
    }
  }

  // Shadow composition accessors

  get cloudsBuffer(): Texture {
    return this.cloudsRenderTarget.texture
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
