/* eslint-disable @typescript-eslint/no-non-null-assertion */

/// <reference types="vite-plugin-glsl/ext" />

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
  Uniform,
  WebGLRenderTarget,
  type Data3DTexture,
  type DataTexture,
  type DepthPackingStrategies,
  type Event,
  type Texture,
  type TextureDataType,
  type Vector3,
  type WebGLRenderer
} from 'three'

import {
  atmosphereEffectBaseOptionsDefaults,
  AtmosphereParameters,
  type AtmosphereEffectBaseOptions
} from '@takram/three-atmosphere'
import { type Ellipsoid } from '@takram/three-geospatial'

import { CloudsMaterial } from './CloudsMaterial'

import fragmentShader from './shaders/cloudsEffect.frag'

export interface CloudsEffectOptions extends AtmosphereEffectBaseOptions {
  blendFunction?: BlendFunction
  resolutionScale?: number
  width?: number
  height?: number
  resolutionX?: number
  resolutionY?: number
  intensity?: number
}

export const cloudsEffectOptionsDefaults = {
  ...atmosphereEffectBaseOptionsDefaults,
  blendFunction: BlendFunction.NORMAL,
  resolutionScale: 1,
  width: Resolution.AUTO_SIZE,
  height: Resolution.AUTO_SIZE
} satisfies CloudsEffectOptions

export class CloudsEffect extends Effect {
  readonly resolution: Resolution
  readonly renderTarget: WebGLRenderTarget
  readonly cloudsMaterial: CloudsMaterial
  readonly cloudsPass: ShaderPass

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

    const renderTarget = new WebGLRenderTarget(1, 1, {
      depthBuffer: false,
      stencilBuffer: false,
      type: HalfFloatType
    })
    renderTarget.texture.name = 'Clouds.Target'
    const cloudsMaterial = new CloudsMaterial({}, atmosphere)
    const cloudsPass = new ShaderPass(cloudsMaterial)

    super('CloudsEffect', fragmentShader, {
      blendFunction,
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, Uniform>([
        ['cloudsBuffer', new Uniform(renderTarget.texture)]
      ])
    })

    this.renderTarget = renderTarget
    this.cloudsMaterial = cloudsMaterial
    this.cloudsPass = cloudsPass
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
  }

  override initialize(
    renderer: WebGLRenderer,
    alpha: boolean,
    frameBufferType: TextureDataType
  ): void {
    this.cloudsPass.initialize(renderer, alpha, frameBufferType)
  }

  override update(
    renderer: WebGLRenderer,
    inputBuffer: WebGLRenderTarget,
    deltaTime?: number
  ): void {
    this.cloudsPass.render(renderer, null, this.renderTarget)
  }

  override setSize(width: number, height: number): void {
    const resolution = this.resolution
    resolution.setBaseSize(width, height)
    this.renderTarget.setSize(resolution.width, resolution.height)
    this.cloudsMaterial.setSize(resolution.width, resolution.height)
    this.cloudsMaterial.copyCameraSettings(this.camera)
  }

  override setDepthTexture(
    depthTexture: Texture,
    depthPacking?: DepthPackingStrategies
  ): void {
    this.cloudsMaterial.depthBuffer = depthTexture
    this.cloudsMaterial.depthPacking = depthPacking ?? 0
  }

  get coverageDetailTexture(): Texture | null {
    return this.cloudsMaterial.coverageDetailTexture
  }

  set coverageDetailTexture(value: Texture | null) {
    this.cloudsMaterial.coverageDetailTexture = value
  }

  get stbnScalarTexture(): Texture | null {
    return this.cloudsMaterial.stbnScalarTexture
  }

  set stbnScalarTexture(value: Texture | null) {
    this.cloudsMaterial.stbnScalarTexture = value
  }

  get stbnVectorTexture(): Texture | null {
    return this.cloudsMaterial.stbnVectorTexture
  }

  set stbnVectorTexture(value: Texture | null) {
    this.cloudsMaterial.stbnVectorTexture = value
  }

  get coverage(): number {
    return this.cloudsMaterial.uniforms.coverage.value
  }

  set coverage(value: number) {
    this.cloudsMaterial.uniforms.coverage.value = value
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
  }

  get correctAltitude(): boolean {
    return this.cloudsMaterial.correctAltitude
  }

  set correctAltitude(value: boolean) {
    this.cloudsMaterial.correctAltitude = value
  }

  get photometric(): boolean {
    return this.cloudsMaterial.photometric
  }

  set photometric(value: boolean) {
    this.cloudsMaterial.photometric = value
  }

  get sunDirection(): Vector3 {
    return this.cloudsMaterial.sunDirection
  }

  get sunAngularRadius(): number {
    return this.cloudsMaterial.sunAngularRadius
  }

  set sunAngularRadius(value: number) {
    this.cloudsMaterial.sunAngularRadius = value
  }
}
