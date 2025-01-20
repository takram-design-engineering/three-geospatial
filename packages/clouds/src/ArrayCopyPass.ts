import { CopyPass } from 'postprocessing'
import { LinearFilter, WebGLArrayRenderTarget, type WebGLRenderer } from 'three'

import { ArrayCopyMaterial } from './ArrayCopyMaterial'
import { setArrayRenderTargetLayers } from './helpers/setArrayRenderTargetLayers'

declare module 'postprocessing' {
  interface CopyPass {
    fullscreenMaterial: CopyMaterial
  }
}

export class ArrayCopyPass extends CopyPass {
  declare renderTarget: WebGLArrayRenderTarget

  constructor(renderTarget?: WebGLArrayRenderTarget, autoResize?: boolean) {
    if (renderTarget == null) {
      renderTarget = new WebGLArrayRenderTarget(1, 1, 1, {
        stencilBuffer: false,
        depthBuffer: false
      })
      renderTarget.texture.minFilter = LinearFilter
      renderTarget.texture.magFilter = LinearFilter
      renderTarget.texture.name = 'CopyPass.Target'
    }
    super(renderTarget, autoResize)
    this.fullscreenMaterial = new ArrayCopyMaterial()
  }

  override render(
    renderer: WebGLRenderer,
    inputBuffer: WebGLArrayRenderTarget,
    outputBuffer: null,
    deltaTime?: number,
    stencilTest?: boolean
  ): void {
    const material = this.fullscreenMaterial
    material.inputBuffer = inputBuffer.texture
    setArrayRenderTargetLayers(renderer, this.renderTarget)
    renderer.render(this.scene, this.camera)
  }

  override setSize(
    width: number,
    height: number,
    depth = this.renderTarget.depth
  ): void {
    if (this.autoResize) {
      const prevDepth = this.renderTarget.depth
      this.renderTarget.setSize(width, height, depth)

      if (depth !== prevDepth) {
        this.fullscreenMaterial.defines.LAYER_COUNT = `${depth}`
        this.fullscreenMaterial.needsUpdate = true
      }
    }
  }
}
