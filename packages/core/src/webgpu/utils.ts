import { NodeBuilder, type Renderer } from 'three/webgpu'

export function isWebGPU(
  target: NodeBuilder | Renderer | Renderer['backend']
): boolean {
  const backend =
    target instanceof NodeBuilder
      ? target.renderer.backend
      : 'backend' in target
        ? target.backend
        : target
  return backend.isWebGPUBackend === true
}
