import type { WebGLRenderer } from 'three'

export function isFloatLinearSupported(renderer: WebGLRenderer): boolean {
  return renderer.getContext().getExtension('OES_texture_float_linear') != null
}
