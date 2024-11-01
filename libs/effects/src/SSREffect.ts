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
  HalfFloatType,
  Uniform,
  WebGLRenderTarget,
  type Camera,
  type DepthPackingStrategies,
  type Event,
  type Texture,
  type TextureDataType,
  type WebGLRenderer
} from 'three'

import {
  SSRMaterial,
  ssrMaterialParametersDefaults,
  type SSRMaterialParameters
} from './SSRMaterial'

import fragmentShader from './shaders/ssrEffect.frag'

export interface SSREffectOptions
  extends Omit<SSRMaterialParameters, 'inputBuffer' | 'depthBuffer'> {
  blendFunction?: BlendFunction
  resolutionScale?: number
  width?: number
  height?: number
  resolutionX?: number
  resolutionY?: number
}

export const ssrEffectOptionsDefaults = {
  blendFunction: BlendFunction.NORMAL
} satisfies SSREffectOptions

export class SSREffect extends Effect {
  readonly resolution: Resolution
  readonly renderTarget: WebGLRenderTarget
  readonly ssrMaterial: SSRMaterial
  readonly ssrPass: ShaderPass

  constructor(
    private camera: Camera,
    options?: SSREffectOptions
  ) {
    const {
      blendFunction,
      geometryBuffer,
      resolutionScale = 0.5,
      width,
      height,
      resolutionX = width,
      resolutionY = height,
      ...others
    } = {
      ...ssrMaterialParametersDefaults,
      ...ssrEffectOptionsDefaults,
      ...options
    }
    super('SSREffect', fragmentShader, {
      blendFunction,
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, Uniform>([['ssrBuffer', new Uniform(null)]])
    })

    this.renderTarget = new WebGLRenderTarget(1, 1, {
      depthBuffer: false,
      stencilBuffer: false,
      type: HalfFloatType
    })
    this.renderTarget.texture.name = 'SSR.Reflection'

    this.ssrMaterial = new SSRMaterial(others)
    this.ssrPass = new ShaderPass(this.ssrMaterial)
    this.ssrMaterial.geometryBuffer = geometryBuffer ?? null

    this.uniforms.get('ssrBuffer')!.value = this.renderTarget.texture

    if (camera != null) {
      this.mainCamera = camera
    }

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
    this.ssrMaterial.copyCameraSettings(value)
  }

  override initialize(
    renderer: WebGLRenderer,
    alpha: boolean,
    frameBufferType: TextureDataType
  ): void {
    this.ssrPass.initialize(renderer, alpha, frameBufferType)
  }

  override update(
    renderer: WebGLRenderer,
    inputBuffer: WebGLRenderTarget,
    deltaTime?: number
  ): void {
    this.ssrPass.render(renderer, inputBuffer, this.renderTarget)
  }

  override setSize(width: number, height: number): void {
    const resolution = this.resolution
    resolution.setBaseSize(width, height)
    this.renderTarget.setSize(resolution.width, resolution.height)
    this.ssrMaterial.setSize(resolution.width, resolution.height)
    this.ssrMaterial.copyCameraSettings(this.camera)
  }

  override setDepthTexture(
    depthTexture: Texture,
    depthPacking?: DepthPackingStrategies
  ): void {
    this.ssrMaterial.depthBuffer = depthTexture
    this.ssrMaterial.depthPacking = depthPacking ?? 0
  }

  get geometryBuffer(): Texture | null {
    return this.ssrMaterial.geometryBuffer
  }

  set geometryBuffer(value: Texture | null) {
    this.ssrMaterial.geometryBuffer = value
  }

  get iterations(): number {
    return this.ssrMaterial.uniforms.iterations.value
  }

  set iterations(value: number) {
    this.ssrMaterial.uniforms.iterations.value = value
  }

  get binarySearchIterations(): number {
    return this.ssrMaterial.uniforms.binarySearchIterations.value
  }

  set binarySearchIterations(value: number) {
    this.ssrMaterial.uniforms.binarySearchIterations.value = value
  }

  get pixelZSize(): number {
    return this.ssrMaterial.uniforms.pixelZSize.value
  }

  set pixelZSize(value: number) {
    this.ssrMaterial.uniforms.pixelZSize.value = value
  }

  get pixelStride(): number {
    return this.ssrMaterial.uniforms.pixelStride.value
  }

  set pixelStride(value: number) {
    this.ssrMaterial.uniforms.pixelStride.value = value
  }

  get pixelStrideZCutoff(): number {
    return this.ssrMaterial.uniforms.pixelStrideZCutoff.value
  }

  set pixelStrideZCutoff(value: number) {
    this.ssrMaterial.uniforms.pixelStrideZCutoff.value = value
  }

  get maxRayDistance(): number {
    return this.ssrMaterial.uniforms.maxRayDistance.value
  }

  set maxRayDistance(value: number) {
    this.ssrMaterial.uniforms.maxRayDistance.value = value
  }

  get screenEdgeFadeStart(): number {
    return this.ssrMaterial.uniforms.screenEdgeFadeStart.value
  }

  set screenEdgeFadeStart(value: number) {
    this.ssrMaterial.uniforms.screenEdgeFadeStart.value = value
  }

  get eyeFadeStart(): number {
    return this.ssrMaterial.uniforms.eyeFadeStart.value
  }

  set eyeFadeStart(value: number) {
    this.ssrMaterial.uniforms.eyeFadeStart.value = value
  }

  get eyeFadeEnd(): number {
    return this.ssrMaterial.uniforms.eyeFadeEnd.value
  }

  set eyeFadeEnd(value: number) {
    this.ssrMaterial.uniforms.eyeFadeEnd.value = value
  }

  get jitter(): number {
    return this.ssrMaterial.uniforms.jitter.value
  }

  set jitter(value: number) {
    this.ssrMaterial.uniforms.jitter.value = value
  }

  get roughness(): number {
    return this.ssrMaterial.uniforms.roughness.value
  }

  set roughness(value: number) {
    this.ssrMaterial.uniforms.roughness.value = value
  }
}
