import { type WebGLArrayRenderTarget, type WebGLRenderer } from 'three'
import invariant from 'tiny-invariant'

export function setArrayRenderTargetLayers(
  renderer: WebGLRenderer,
  outputBuffer: WebGLArrayRenderTarget
): void {
  const glTexture = (
    renderer.properties.get(outputBuffer.texture) as {
      __webglTexture?: WebGLTexture
    }
  ).__webglTexture

  const gl = renderer.getContext()
  invariant(gl instanceof WebGL2RenderingContext)

  renderer.setRenderTarget(outputBuffer)
  const drawBuffers: number[] = []
  if (glTexture != null) {
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
  }
  gl.drawBuffers(drawBuffers)
}
