import { WebGLRenderer } from 'three'
import type { Renderer } from 'three/webgpu'

export function isFloatLinearSupported(
  renderer: Renderer | WebGLRenderer
): boolean {
  return renderer instanceof WebGLRenderer
    ? renderer.getContext().getExtension('OES_texture_float_linear') != null
    : ((
        renderer.backend as (typeof renderer)['backend'] & {
          hasFeature?: (name: string) => boolean
        }
      ).hasFeature?.('float32-filterable') ?? false)
}
