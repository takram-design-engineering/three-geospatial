/* eslint-disable @typescript-eslint/no-non-null-assertion */

import {
  BlendFunction,
  Effect,
  EffectAttribute,
  GaussianBlurPass,
  Resolution,
  ShaderPass
} from 'postprocessing'
import {
  Camera,
  Clock,
  HalfFloatType,
  Matrix4,
  Uniform,
  Vector3,
  WebGLRenderTarget,
  type Data3DTexture,
  type DataTexture,
  type DepthPackingStrategies,
  type Event,
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
import { LocalWeather } from './LocalWeather'
import { updateCloudLayerUniforms, type CloudLayers } from './uniforms'

import fragmentShader from './shaders/cloudsEffect.frag?raw'

const matrixScratch1 = /*#__PURE__*/ new Matrix4()
const matrixScratch2 = /*#__PURE__*/ new Matrix4()

export interface CloudsEffectOptions {
  blendFunction?: BlendFunction
  resolutionScale?: number
  width?: number
  height?: number
  resolutionX?: number
  resolutionY?: number
  intensity?: number
}

export const cloudsEffectOptionsDefaults = {
  blendFunction: BlendFunction.NORMAL,
  resolutionScale: 1,
  width: Resolution.AUTO_SIZE,
  height: Resolution.AUTO_SIZE
} satisfies CloudsEffectOptions

export class CloudsEffect extends Effect {
  // TODO: Cumulus, Altostratus, Cirrocumulus, Cirrus
  readonly cloudLayers: CloudLayers = [
    {
      minHeight: 600,
      maxHeight: 1400,
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
      // minHeight: 4500,
      // maxHeight: 5000,
      // extinctionCoeff: 0.1,
      // detailAmount: 0.8,
      // weatherExponent: 1,
      // coverageFilterWidth: 0.3
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
  readonly cascadedShadows: CascadedShadows

  readonly shadowMatrices = [
    new Matrix4(),
    new Matrix4(),
    new Matrix4(),
    new Matrix4()
  ]

  readonly inverseShadowMatrices = [
    new Matrix4(),
    new Matrix4(),
    new Matrix4(),
    new Matrix4()
  ]

  readonly localWeather: LocalWeather
  readonly cloudShape: CloudShape
  readonly cloudShapeDetail: CloudShapeDetail
  readonly cloudsRenderTarget: WebGLRenderTarget
  readonly cloudsMaterial: CloudsMaterial
  readonly cloudsPass: ShaderPass
  readonly shadowRenderTarget: WebGLRenderTarget
  readonly shadowMaterial: CloudsShadowMaterial
  readonly shadowPass: ShaderPass
  readonly blurPass: GaussianBlurPass
  readonly resolution: Resolution

  useBlur = false
  private frame = 0
  private readonly clock = new Clock()

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
    const cloudShape = new CloudShape()
    const cloudShapeDetail = new CloudShapeDetail()

    const cloudsRenderTarget = new WebGLRenderTarget(1, 1, {
      depthBuffer: false,
      stencilBuffer: false,
      type: HalfFloatType
    })
    cloudsRenderTarget.texture.name = 'Clouds.Target'

    const shadowMapSize = 2048 // TODO: Parametrize
    const shadowRenderTarget = new WebGLRenderTarget(
      shadowMapSize,
      shadowMapSize,
      {
        depthBuffer: false,
        stencilBuffer: false,
        type: HalfFloatType
      }
    )
    shadowRenderTarget.texture.name = 'Clouds.Shadow'

    // This instance is shared between clouds and shadow materials.
    const sunDirection = new Vector3()

    const cascadedShadows = new CascadedShadows({
      lambda: 0.6,
      far: 1e5 // TODO: Parametrize
    })

    const cloudsMaterial = new CloudsMaterial(
      { sunDirectionRef: sunDirection },
      atmosphere
    )
    const cloudsUniforms = cloudsMaterial.uniforms
    cloudsUniforms.localWeatherTexture.value = localWeather.texture
    cloudsUniforms.shapeTexture.value = cloudShape.texture
    cloudsUniforms.shapeDetailTexture.value = cloudShapeDetail.texture
    cloudsUniforms.shadowBuffer.value = shadowRenderTarget.texture
    cloudsUniforms.shadowTexelSize.value.set(1, 1).divideScalar(shadowMapSize)

    const shadowMaterial = new CloudsShadowMaterial(
      { sunDirectionRef: sunDirection },
      atmosphere
    )
    shadowMaterial.setSize(shadowMapSize, shadowMapSize)
    const shadowUniforms = shadowMaterial.uniforms
    shadowUniforms.localWeatherTexture.value = localWeather.texture
    shadowUniforms.shapeTexture.value = cloudShape.texture
    shadowUniforms.shapeDetailTexture.value = cloudShapeDetail.texture

    const cloudsPass = new ShaderPass(cloudsMaterial)
    const shadowPass = new ShaderPass(shadowMaterial)
    const blurPass = new GaussianBlurPass({
      kernelSize: 12
    })

    super('CloudsEffect', fragmentShader, {
      blendFunction,
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, Uniform>([
        ['cloudsBuffer', new Uniform(cloudsRenderTarget.texture)]
      ])
    })

    this.sunDirection = sunDirection
    this.cascadedShadows = cascadedShadows
    this.localWeather = localWeather
    this.cloudShape = cloudShape
    this.cloudShapeDetail = cloudShapeDetail
    this.cloudsRenderTarget = cloudsRenderTarget
    this.cloudsMaterial = cloudsMaterial
    this.cloudsPass = cloudsPass
    this.shadowRenderTarget = shadowRenderTarget
    this.shadowMaterial = shadowMaterial
    this.shadowPass = shadowPass
    this.blurPass = blurPass

    this.mainCamera = camera // Need to assign after setting up the pass.

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
    this.shadowPass.initialize(renderer, alpha, frameBufferType)
    this.cloudsPass.initialize(renderer, alpha, frameBufferType)
    this.blurPass.initialize(renderer, alpha, frameBufferType)
  }

  updateShadowMatrix(): void {
    assertType<PerspectiveCamera>(this.mainCamera)
    const shadows = this.cascadedShadows
    shadows.update(this.mainCamera, this.sunDirection, this.ellipsoid)

    const shadowUniforms = this.shadowMaterial.uniforms
    const cloudsUniforms = this.cloudsMaterial.uniforms
    for (let i = 0; i < 4; ++i) {
      const light = shadows.lights[i]
      const projectionMatrix = matrixScratch1.copy(light.projectionMatrix)
      const inverseViewMatrix = matrixScratch2.copy(light.inverseViewMatrix)
      const shadowMatrix = this.shadowMatrices[i]
      const inverseShadowMatrix = this.inverseShadowMatrices[i]
      shadowMatrix.copy(projectionMatrix)
      inverseShadowMatrix.copy(inverseViewMatrix)
      shadowMatrix.multiply(inverseViewMatrix.invert())
      inverseShadowMatrix.multiply(projectionMatrix.invert())
      cloudsUniforms.shadowMatrices.value[i].copy(shadowMatrix)
      shadowUniforms.inverseShadowMatrices.value[i].copy(inverseShadowMatrix)
      cloudsUniforms.shadowCascades.value[i].copy(shadows.cascades[i])
    }
    cloudsUniforms.shadowFar.value = this.cascadedShadows.far
  }

  override update(
    renderer: WebGLRenderer,
    inputBuffer: WebGLRenderTarget,
    deltaTime?: number
  ): void {
    this.localWeather.update(renderer)
    this.cloudShape.update(renderer)
    this.cloudShapeDetail.update(renderer)

    ++this.frame
    const time = this.clock.getElapsedTime()
    const cloudsUniforms = this.cloudsMaterial.uniforms
    const shadowUniforms = this.shadowMaterial.uniforms
    updateCloudLayerUniforms(cloudsUniforms, this.cloudLayers)
    updateCloudLayerUniforms(shadowUniforms, this.cloudLayers)
    cloudsUniforms.frame.value = this.frame
    shadowUniforms.frame.value = this.frame
    cloudsUniforms.time.value = time
    shadowUniforms.time.value = time

    this.cloudsMaterial.copyCameraSettings(this.camera)
    this.shadowMaterial.copyCameraSettings(this.camera)
    this.updateShadowMatrix()

    this.shadowPass.render(renderer, null, this.shadowRenderTarget)
    if (this.useBlur) {
      this.blurPass.render(
        renderer,
        this.shadowRenderTarget,
        this.shadowRenderTarget
      )
    }
    this.cloudsPass.render(renderer, null, this.cloudsRenderTarget)
  }

  override setSize(width: number, height: number): void {
    const resolution = this.resolution
    resolution.setBaseSize(width, height)
    this.cloudsRenderTarget.setSize(resolution.width, resolution.height)
    this.cloudsMaterial.setSize(resolution.width, resolution.height)
    this.blurPass.setSize(resolution.width, resolution.height)

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

  get localWeatherTexture(): Texture | null {
    return this.cloudsMaterial.uniforms.localWeatherTexture.value
  }

  set localWeatherTexture(value: Texture | null) {
    this.cloudsMaterial.uniforms.localWeatherTexture.value = value
    this.shadowMaterial.uniforms.localWeatherTexture.value = value
  }

  get blueNoiseTexture(): Data3DTexture | null {
    return this.cloudsMaterial.uniforms.blueNoiseTexture.value
  }

  set blueNoiseTexture(value: Data3DTexture | null) {
    this.cloudsMaterial.uniforms.blueNoiseTexture.value = value
    this.shadowMaterial.uniforms.blueNoiseTexture.value = value
  }

  get blueNoiseVectorTexture(): Data3DTexture | null {
    return this.cloudsMaterial.uniforms.blueNoiseVectorTexture.value
  }

  set blueNoiseVectorTexture(value: Data3DTexture | null) {
    this.cloudsMaterial.uniforms.blueNoiseVectorTexture.value = value
    this.shadowMaterial.uniforms.blueNoiseVectorTexture.value = value
  }

  get coverage(): number {
    return this.cloudsMaterial.uniforms.coverage.value
  }

  set coverage(value: number) {
    this.cloudsMaterial.uniforms.coverage.value = value
    this.shadowMaterial.uniforms.coverage.value = value
  }

  // Redundant pass-though accessors.

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
