import { ShaderPass } from 'postprocessing'
import {
  type Material,
  type Uniform,
  type WebGLArrayRenderTarget,
  type WebGLRenderer,
  type WebGLRenderTarget
} from 'three'

import { assertType } from '@takram/three-geospatial'

import { setArrayRenderTargetLayers } from './helpers/setArrayRenderTargetLayers'

export class ShaderArrayPass extends ShaderPass {
  override render(
    renderer: WebGLRenderer,
    inputBuffer: WebGLRenderTarget | null,
    outputBuffer: WebGLArrayRenderTarget,
    deltaTime?: number,
    stencilTest?: boolean
  ): void {
    assertType<{
      fullscreenMaterial: Material & {
        uniforms?: Record<string, Uniform>
      }
      input: string
    }>(this)

    const uniforms = this.fullscreenMaterial.uniforms
    if (inputBuffer !== null && uniforms?.[this.input] != null) {
      uniforms[this.input].value = inputBuffer.texture
    }
    setArrayRenderTargetLayers(renderer, outputBuffer)
    renderer.render(this.scene, this.camera)
  }
}
