import { GaussianBlurMaterial, Pass } from 'postprocessing'
import {
  GLSL3,
  Uniform,
  type Texture,
  type Vector2,
  type WebGLArrayRenderTarget,
  type WebGLRenderer
} from 'three'

import { setArrayRenderTargetLayers } from './helpers/setArrayRenderTargetLayers'

import fragmentShader from './shaders/shadowFilter.frag?raw'

declare module 'postprocessing' {
  interface GaussianBlurMaterial {
    direction: Vector2
    inputBuffer: Texture | null
  }
}

export interface ShadowHistoryFilterPassOptions {
  kernelSize?: number

  // Temporal anti-aliasing needs a separate history buffer to avoid feedback
  // loops. We use an intermediate buffer during the separable blur as the
  // history. This reduces only one render, but because we're rendering into an
  // array target, it's not insignificant.
  historyRenderTarget: WebGLArrayRenderTarget
}

export class ShadowHistoryFilterPass extends Pass {
  blurMaterial: GaussianBlurMaterial
  historyRenderTarget: WebGLArrayRenderTarget

  constructor({
    kernelSize = 35,
    historyRenderTarget
  }: ShadowHistoryFilterPassOptions) {
    super('ShadowHistoryFilterPass')

    this.blurMaterial = new GaussianBlurMaterial({ kernelSize })
    this.blurMaterial.glslVersion = GLSL3
    this.blurMaterial.fragmentShader = fragmentShader
    this.blurMaterial.uniforms.inputChannel = new Uniform(0)
    this.historyRenderTarget = historyRenderTarget
  }

  render(
    renderer: WebGLRenderer,
    inputBuffer: WebGLArrayRenderTarget,
    outputBuffer: WebGLArrayRenderTarget,
    deltaTime?: number,
    stencilTest?: boolean
  ): void {
    if (this.historyRenderTarget == null) {
      throw new Error('You must set historyRenderTarget before rendering.')
    }

    const scene = this.scene
    const camera = this.camera
    const blurMaterial = this.blurMaterial
    this.fullscreenMaterial = blurMaterial

    const layerCount = +this.blurMaterial.defines.LAYER_COUNT
    if (layerCount !== outputBuffer.depth) {
      this.blurMaterial.defines.LAYER_COUNT = `${outputBuffer.depth}`
      this.blurMaterial.needsUpdate = true
    }

    // Horizontal: Channel B to A
    blurMaterial.direction.set(1, 0)
    this.blurMaterial.uniforms.inputChannel.value = 2
    blurMaterial.inputBuffer = inputBuffer.texture
    setArrayRenderTargetLayers(renderer, this.historyRenderTarget)
    renderer.render(scene, camera)

    // Vertical: Channel A to A
    blurMaterial.direction.set(0, 1)
    this.blurMaterial.uniforms.inputChannel.value = 3
    blurMaterial.inputBuffer = this.historyRenderTarget.texture
    setArrayRenderTargetLayers(renderer, outputBuffer)
    renderer.render(scene, camera)
  }
}
