import { ShaderPass } from 'postprocessing'
import {
  type Material,
  type Uniform,
  type WebGLArrayRenderTarget,
  type WebGLRenderer,
  type WebGLRenderTarget
} from 'three'
import invariant from 'tiny-invariant'

declare module 'postprocessing' {
  interface ShaderPass {
    fullscreenMaterial: Material & {
      uniforms?: Record<string, Uniform>
    }
    input: string
  }
}

export class MRTArrayShaderPass extends ShaderPass {
  override render(
    renderer: WebGLRenderer,
    inputBuffer: WebGLRenderTarget | null,
    outputBuffer: WebGLArrayRenderTarget,
    deltaTime?: number,
    stencilTest?: boolean
  ): void {
    const uniforms = this.fullscreenMaterial.uniforms
    if (inputBuffer !== null && uniforms?.[this.input] != null) {
      uniforms[this.input].value = inputBuffer.texture
    }

    renderer.setRenderTarget(outputBuffer)
    const gl = renderer.getContext()
    invariant(gl instanceof WebGL2RenderingContext)
    const textureProperties = renderer.properties.get(outputBuffer.texture) as {
      __webglTexture: WebGLTexture
    }
    const glTexture = textureProperties.__webglTexture
    const drawBuffers: number[] = []
    for (let layer = 0; layer < outputBuffer.depth; ++layer) {
      gl.framebufferTextureLayer(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0 + layer,
        glTexture,
        0,
        layer
      )
      drawBuffers.push(gl.COLOR_ATTACHMENT0 + layer)
    }
    gl.drawBuffers(drawBuffers)
    renderer.render(this.scene, this.camera)
  }
}
