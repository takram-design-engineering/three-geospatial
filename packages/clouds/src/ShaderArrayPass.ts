import { ShaderPass, type CopyMaterial } from 'postprocessing'
import type {
  Uniform,
  WebGLArrayRenderTarget,
  WebGLRenderer,
  WebGLRenderTarget
} from 'three'

import { setArrayRenderTargetLayers } from './helpers/setArrayRenderTargetLayers'

export class ShaderArrayPass extends ShaderPass {
  declare input: string

  override render(
    renderer: WebGLRenderer,
    inputBuffer: WebGLRenderTarget | null,
    outputBuffer: WebGLArrayRenderTarget,
    deltaTime?: number,
    stencilTest?: boolean
  ): void {
    const uniforms = (
      this.fullscreenMaterial as CopyMaterial & {
        uniforms?: Record<string, Uniform>
      }
    ).uniforms
    if (inputBuffer !== null && uniforms?.[this.input] != null) {
      uniforms[this.input].value = inputBuffer.texture
    }
    setArrayRenderTargetLayers(renderer, outputBuffer)
    renderer.render(this.scene, this.camera)
  }
}
