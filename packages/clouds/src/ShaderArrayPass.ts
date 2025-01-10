import { ShaderPass } from 'postprocessing'
import {
  type Material,
  type ShaderMaterial,
  type Uniform,
  type WebGLArrayRenderTarget,
  type WebGLRenderer,
  type WebGLRenderTarget
} from 'three'

import { assertType } from '@takram/three-geospatial'

import { setMRTArrayRenderTarget } from './helpers/setMRTArrayRenderTarget'

export class ShaderArrayPass extends ShaderPass {
  constructor(
    material: ShaderMaterial,
    public layerCount?: number,
    input?: string
  ) {
    super(material, input)
  }

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
    setMRTArrayRenderTarget(renderer, outputBuffer, this.layerCount)
    renderer.render(this.scene, this.camera)
  }
}
