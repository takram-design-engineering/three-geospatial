import { CopyPass } from 'postprocessing'
import { LinearFilter, WebGLArrayRenderTarget, type WebGLRenderer } from 'three'

import { CopyArrayMaterial } from './CopyArrayMaterial'
import { setArrayRenderTargetLayers } from './helpers/setArrayRenderTargetLayers'

declare module 'postprocessing' {
  interface CopyPass {
    fullscreenMaterial: CopyMaterial
  }
}

export class CopyArrayPass extends CopyPass {
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
    this.fullscreenMaterial = new CopyArrayMaterial()
  }

  override render(
    renderer: WebGLRenderer,
    inputBuffer: WebGLArrayRenderTarget,
    outputBuffer: WebGLArrayRenderTarget | null,
    deltaTime?: number,
    stencilTest?: boolean
  ): void {
    const material = this.fullscreenMaterial
    material.inputBuffer = inputBuffer.texture
    setArrayRenderTargetLayers(
      renderer,
      this.renderToScreen ? null : this.renderTarget
    )
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
