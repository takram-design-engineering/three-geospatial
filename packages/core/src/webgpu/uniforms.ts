import { uniform, type ShaderNodeObject } from 'three/tsl'
import type { NodeFrame, UniformNode } from 'three/webgpu'

declare module 'three/webgpu' {
  interface Node {
    onRenderUpdate(
      callback: (this: this, frame: NodeFrame, self: this) => void
    ): this
  }
}

export function uniformUpdate<T>(
  value: T,
  callback: (self: ShaderNodeObject<UniformNode<T>>) => T | undefined
): ShaderNodeObject<UniformNode<T>> {
  return uniform(value).onRenderUpdate((_, self) => {
    const value = callback(self)
    if (value != null) {
      self.value = value
    }
  })
}
