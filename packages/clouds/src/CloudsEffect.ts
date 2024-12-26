/* eslint-disable @typescript-eslint/no-non-null-assertion */

import {
  BlendFunction,
  Effect,
  EffectAttribute,
  KawaseBlurPass,
  KernelSize,
  Resolution,
  ShaderPass
} from 'postprocessing'
import {
  Camera,
  Clock,
  HalfFloatType,
  Matrix4,
  RGBFormat,
  Uniform,
  Vector3,
  WebGLRenderTarget,
  type Data3DTexture,
  type DataTexture,
  type DepthPackingStrategies,
  type Event,
  type Texture,
  type TextureDataType,
  type WebGLRenderer
} from 'three'

import { AtmosphereParameters } from '@takram/three-atmosphere'
import { type Ellipsoid } from '@takram/three-geospatial'

import { CloudShape } from './CloudShape'
import { CloudShapeDetail } from './CloudShapeDetail'
import { CloudsMaterial } from './CloudsMaterial'
import { CloudsShadowMaterial } from './CloudsShadowMaterial'
import { updateCloudLayerUniforms, type CloudLayers } from './uniforms'

import fragmentShader from './shaders/cloudsEffect.frag?raw'

const vectorScratch1 = /*#__PURE__*/ new Vector3()
const vectorScratch2 = /*#__PURE__*/ new Vector3()
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
  readonly cloudShape: CloudShape
  readonly cloudShapeDetail: CloudShapeDetail

  // TODO: Cumulus, Altostratus, Cirrocumulus, Cirrus
  readonly cloudLayers: CloudLayers = [
    {
      minHeight: 600,
      maxHeight: 1600,
      extinctionCoeff: 0.3,
      detailAmount: 1,
      weatherExponent: 1,
      coverageFilterWidth: 0.6
    },
    {
      minHeight: 4500,
      maxHeight: 5000,
      extinctionCoeff: 0.1,
      detailAmount: 0.8,
      weatherExponent: 1,
      coverageFilterWidth: 0.3
    },
    {
      minHeight: 6700,
      maxHeight: 8000,
      extinctionCoeff: 0.005,
      detailAmount: 0.3,
      weatherExponent: 2,
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

  readonly resolution: Resolution
  readonly cloudsRenderTarget: WebGLRenderTarget
  readonly cloudsMaterial: CloudsMaterial
  readonly cloudsPass: ShaderPass
  readonly shadowRenderTarget: WebGLRenderTarget
  readonly shadowMaterial: CloudsShadowMaterial
  readonly shadowPass: ShaderPass
  readonly blurPass: KawaseBlurPass

  readonly shadowMatrix = new Matrix4()

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

    const cloudShape = new CloudShape()
    const cloudShapeDetail = new CloudShapeDetail()

    const cloudsRenderTarget = new WebGLRenderTarget(1, 1, {
      depthBuffer: false,
      stencilBuffer: false,
      type: HalfFloatType
    })
    cloudsRenderTarget.texture.name = 'Clouds.Target'

    // TODO: Implement cascaded shadow map.
    const shadowMapSize = 2048
    const shadowRenderTarget = new WebGLRenderTarget(
      shadowMapSize,
      shadowMapSize,
      {
        depthBuffer: false,
        stencilBuffer: false,
        type: HalfFloatType,
        format: RGBFormat,
        internalFormat: 'R11F_G11F_B10F'
      }
    )
    shadowRenderTarget.texture.name = 'Clouds.Shadow'

    const cloudsMaterial = new CloudsMaterial({}, atmosphere)
    const cloudsPass = new ShaderPass(cloudsMaterial)

    const shadowMaterial = new CloudsShadowMaterial({}, atmosphere)
    shadowMaterial.setSize(shadowMapSize, shadowMapSize)
    const shadowPass = new ShaderPass(shadowMaterial)

    const blurPass = new KawaseBlurPass({
      kernelSize: KernelSize.SMALL
    })

    const cloudsUniforms = cloudsMaterial.uniforms
    cloudsUniforms.shapeTexture.value = cloudShape.texture
    cloudsUniforms.shapeDetailTexture.value = cloudShapeDetail.texture
    cloudsUniforms.shadowBuffer.value = shadowRenderTarget.texture

    const shadowUniforms = shadowMaterial.uniforms
    shadowUniforms.shapeTexture.value = cloudShape.texture
    shadowUniforms.shapeDetailTexture.value = cloudShapeDetail.texture

    super('CloudsEffect', fragmentShader, {
      blendFunction,
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, Uniform>([
        ['cloudsBuffer', new Uniform(cloudsRenderTarget.texture)]
      ])
    })

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
    // TODO: Implement cascaded shadow map.
    const range = 10000
    const projectionMatrix = matrixScratch1.makeOrthographic(
      -range,
      range,
      -range,
      range,
      // Clip depth doesn't matter.
      0,
      1
    )

    const cameraPosition = this.camera.getWorldPosition(vectorScratch1)
    const sunPosition = vectorScratch2
      .copy(this.sunDirection)
      .multiplyScalar(50000)
      .add(cameraPosition)
    const viewMatrix = matrixScratch2
      .lookAt(sunPosition, cameraPosition, Camera.DEFAULT_UP)
      .setPosition(sunPosition)

    const shadowUniforms = this.shadowMaterial.uniforms
    shadowUniforms.inverseProjectionMatrix.value.copy(projectionMatrix).invert()
    shadowUniforms.viewMatrix.value.copy(viewMatrix)

    const cloudsUniforms = this.cloudsMaterial.uniforms
    this.shadowMatrix.multiplyMatrices(projectionMatrix, viewMatrix.invert())
    cloudsUniforms.shadowMatrix.value.copy(this.shadowMatrix)
  }

  override update(
    renderer: WebGLRenderer,
    inputBuffer: WebGLRenderTarget,
    deltaTime?: number
  ): void {
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
    this.blurPass.render(
      renderer,
      this.shadowRenderTarget,
      this.shadowRenderTarget
    )
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

  get blueNoiseTexture(): Texture | null {
    return this.cloudsMaterial.uniforms.blueNoiseTexture.value
  }

  set blueNoiseTexture(value: Texture | null) {
    this.cloudsMaterial.uniforms.blueNoiseTexture.value = value
    this.shadowMaterial.uniforms.blueNoiseTexture.value = value
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

  get sunDirection(): Vector3 {
    return this.cloudsMaterial.sunDirection // TODO
  }

  get sunAngularRadius(): number {
    return this.cloudsMaterial.sunAngularRadius
  }

  set sunAngularRadius(value: number) {
    this.cloudsMaterial.sunAngularRadius = value
  }
}
