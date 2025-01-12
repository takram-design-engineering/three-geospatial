import { type WebGLArrayRenderTarget, type WebGLRenderer } from 'three'
import invariant from 'tiny-invariant'

export function setMRTArrayRenderTarget(
  renderer: WebGLRenderer,
  outputBuffer: WebGLArrayRenderTarget | null
): void {
  renderer.setRenderTarget(outputBuffer)
  if (outputBuffer == null) {
    return
  }

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
}
