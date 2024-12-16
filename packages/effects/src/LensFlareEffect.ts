/* eslint-disable @typescript-eslint/no-non-null-assertion */

/// <reference types="vite-plugin-glsl/ext" />

import {
  BlendFunction,
  Effect,
  EffectAttribute,
  KawaseBlurPass,
  KernelSize,
  MipmapBlurPass,
  Resolution,
  ShaderPass
} from 'postprocessing'
import {
  HalfFloatType,
  Uniform,
  WebGLRenderTarget,
  type Event,
  type TextureDataType,
  type WebGLRenderer
} from 'three'

import { DownsampleThresholdMaterial } from './DownsampleThresholdMaterial'
import { LensFlareFeaturesMaterial } from './LensFlareFeaturesMaterial'

import fragmentShader from './shaders/lensFlareEffect.frag'

export interface LensFlareEffectOptions {
  blendFunction?: BlendFunction
  resolutionScale?: number
  width?: number
  height?: number
  resolutionX?: number
  resolutionY?: number
  intensity?: number
}

export const lensFlareEffectOptionsDefaults = {
  blendFunction: BlendFunction.NORMAL,
  resolutionScale: 0.5,
  width: Resolution.AUTO_SIZE,
  height: Resolution.AUTO_SIZE,
  intensity: 0.005
} satisfies LensFlareEffectOptions

// Reference: https://www.froyok.fr/blog/2021-09-ue4-custom-lens-flare/
export class LensFlareEffect extends Effect {
  readonly resolution: Resolution
  readonly renderTarget1: WebGLRenderTarget
  readonly renderTarget2: WebGLRenderTarget

  readonly thresholdMaterial: DownsampleThresholdMaterial
  readonly thresholdPass: ShaderPass
  readonly blurPass: MipmapBlurPass
  readonly preBlurPass: KawaseBlurPass
  readonly featuresMaterial: LensFlareFeaturesMaterial
  readonly featuresPass: ShaderPass

  constructor(options?: LensFlareEffectOptions) {
    const {
      blendFunction,
      resolutionScale,
      width,
      height,
      resolutionX = width,
      resolutionY = height,
      intensity
    } = {
      ...lensFlareEffectOptionsDefaults,
      ...options
    }
    super('LensFlareEffect', fragmentShader, {
      blendFunction,
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, Uniform>([
        ['bloomBuffer', new Uniform(null)],
        ['featuresBuffer', new Uniform(null)],
        ['intensity', new Uniform(1)]
      ])
    })

    this.renderTarget1 = new WebGLRenderTarget(1, 1, {
      depthBuffer: false,
      stencilBuffer: false,
      type: HalfFloatType
    })
    this.renderTarget1.texture.name = 'LensFlare.Target1'

    this.renderTarget2 = new WebGLRenderTarget(1, 1, {
      depthBuffer: false,
      stencilBuffer: false,
      type: HalfFloatType
    })
    this.renderTarget2.texture.name = 'LensFlare.Target2'

    this.thresholdMaterial = new DownsampleThresholdMaterial()
    this.thresholdPass = new ShaderPass(this.thresholdMaterial)

    this.blurPass = new MipmapBlurPass()
    this.blurPass.levels = 8

    this.preBlurPass = new KawaseBlurPass({
      kernelSize: KernelSize.SMALL
    })

    this.featuresMaterial = new LensFlareFeaturesMaterial()
    this.featuresPass = new ShaderPass(this.featuresMaterial)

    this.uniforms.get('bloomBuffer')!.value = this.blurPass.texture
    this.uniforms.get('featuresBuffer')!.value = this.renderTarget1.texture

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

    this.intensity = intensity
  }

  private readonly onResolutionChange = (): void => {
    this.setSize(this.resolution.baseWidth, this.resolution.baseHeight)
  }

  override initialize(
    renderer: WebGLRenderer,
    alpha: boolean,
    frameBufferType: TextureDataType
  ): void {
    this.thresholdPass.initialize(renderer, alpha, frameBufferType)
    this.blurPass.initialize(renderer, alpha, frameBufferType)
    this.preBlurPass.initialize(renderer, alpha, frameBufferType)
    this.featuresPass.initialize(renderer, alpha, frameBufferType)
  }

  override update(
    renderer: WebGLRenderer,
    inputBuffer: WebGLRenderTarget,
    deltaTime?: number
  ): void {
    this.thresholdPass.render(renderer, inputBuffer, this.renderTarget1)
    this.blurPass.render(renderer, this.renderTarget1, null)
    this.preBlurPass.render(renderer, this.renderTarget1, this.renderTarget2)
    this.featuresPass.render(renderer, this.renderTarget2, this.renderTarget1)
  }

  override setSize(width: number, height: number): void {
    const resolution = this.resolution
    resolution.setBaseSize(width, height)
    this.renderTarget1.setSize(resolution.width, resolution.height)
    this.renderTarget2.setSize(resolution.width, resolution.height)
    this.thresholdMaterial.setSize(resolution.width, resolution.height)
    this.blurPass.setSize(resolution.width, resolution.height)
    this.preBlurPass.setSize(resolution.width, resolution.height)
    this.featuresMaterial.setSize(resolution.width, resolution.height)
  }

  get intensity(): number {
    return this.uniforms.get('intensity')!.value
  }

  set intensity(value: number) {
    this.uniforms.get('intensity')!.value = value
  }

  get thresholdLevel(): number {
    return this.thresholdMaterial.thresholdLevel
  }

  set thresholdLevel(value: number) {
    this.thresholdMaterial.thresholdLevel = value
  }

  get thresholdRange(): number {
    return this.thresholdMaterial.thresholdRange
  }

  set thresholdRange(value: number) {
    this.thresholdMaterial.thresholdRange = value
  }
}
