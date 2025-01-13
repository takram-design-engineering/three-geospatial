// Obviously based on:
// https://github.com/pmndrs/postprocessing/blob/main/src/passes/GaussianBlurPass.js
// Provides for rendering array target layers as MRT.

import { GaussianBlurPass } from 'postprocessing'
import {
  GLSL3,
  WebGLArrayRenderTarget,
  type Texture,
  type Vector2,
  type WebGLRenderer
} from 'three'

import { CopyArrayMaterial } from './CopyArrayMaterial'
import { setArrayRenderTargetLayers } from './helpers/setArrayRenderTargetLayers'

import fragmentShader from './shaders/shadowFilter.frag?raw'

declare module 'postprocessing' {
  interface GaussianBlurMaterial {
    direction: Vector2
    inputBuffer: Texture | null
    setSize: (width: number, height: number) => void
  }

  interface GaussianBlurPass {
    renderTargetA: WebGLArrayRenderTarget
    renderTargetB: WebGLArrayRenderTarget
    blurMaterial: GaussianBlurMaterial
    copyMaterial: CopyArrayMaterial
    resolution: Resolution
    iterations: number
  }
}

export type ShadowFilterPassOptions = ConstructorParameters<
  typeof GaussianBlurPass
>[0]

export class ShadowFilterPass extends GaussianBlurPass {
  constructor(options?: ShadowFilterPassOptions) {
    super(options)

    this.renderTargetA = new WebGLArrayRenderTarget(1, 1, 1, {
      depthBuffer: false,
      stencilBuffer: false
    })
    this.renderTargetA.texture.name = 'Blur.Target.A'
    this.renderTargetB = new WebGLArrayRenderTarget()
    this.renderTargetB.texture.name = 'Blur.Target.B'
    this.blurMaterial.glslVersion = GLSL3
    this.blurMaterial.fragmentShader = fragmentShader
    this.blurMaterial.defines.LAYER_COUNT = '1'
    this.copyMaterial = new CopyArrayMaterial()
    this.copyMaterial.inputBuffer = this.renderTargetB.texture
    this.copyMaterial.defines.LAYER_COUNT = '1'
  }

  render(
    renderer: WebGLRenderer,
    inputBuffer: WebGLArrayRenderTarget,
    outputBuffer: WebGLArrayRenderTarget,
    deltaTime?: number,
    stencilTest?: boolean
  ): void {
    const scene = this.scene
    const camera = this.camera
    const renderTargetA = this.renderTargetA
    const renderTargetB = this.renderTargetB
    const blurMaterial = this.blurMaterial
    this.fullscreenMaterial = blurMaterial

    let previousBuffer = inputBuffer

    for (let i = 0, l = Math.max(this.iterations, 1); i < l; ++i) {
      // Blur direction: Horizontal
      blurMaterial.direction.set(1.0, 0.0)
      blurMaterial.inputBuffer = previousBuffer.texture
      setArrayRenderTargetLayers(renderer, renderTargetA)
      renderer.render(scene, camera)

      // Blur direction: Vertical
      blurMaterial.direction.set(0.0, 1.0)
      blurMaterial.inputBuffer = renderTargetA.texture
      setArrayRenderTargetLayers(renderer, renderTargetB)
      renderer.render(scene, camera)

      if (i === 0 && l > 1) {
        // Use renderTargetB as input for further blur iterations.
        previousBuffer = renderTargetB
      }
    }

    // Copy the result to the output buffer.
    this.fullscreenMaterial = this.copyMaterial
    setArrayRenderTargetLayers(renderer, outputBuffer)
    renderer.render(scene, camera)
  }

  setSize(
    width: number,
    height: number,
    depth = this.renderTargetA.depth
  ): void {
    const resolution = this.resolution
    resolution.setBaseSize(width, height)
    const prevDepth = this.renderTargetA.depth
    this.renderTargetA.setSize(resolution.width, resolution.height, depth)
    this.renderTargetB.setSize(resolution.width, resolution.height, depth)
    this.blurMaterial.setSize(width, height)

    if (depth !== prevDepth) {
      this.blurMaterial.defines.LAYER_COUNT = `${depth}`
      this.blurMaterial.needsUpdate = true
      this.copyMaterial.defines.LAYER_COUNT = `${depth}`
      this.copyMaterial.needsUpdate = true
    }
  }
}
