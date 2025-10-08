import type Backend from 'three/src/renderers/common/Backend.js'
import { NodeBuilder, type Renderer } from 'three/webgpu'

import { reinterpretType } from '../types'

export function isWebGPU(target: NodeBuilder | Renderer | Backend): boolean {
  const renderer = target instanceof NodeBuilder ? target.renderer : target
  const backend = 'backend' in renderer ? renderer.backend : target
  // WORKAROUND: The type of Backend cannot be augmented because it is
  // default-exported.
  reinterpretType<Backend & { isWebGPUBackend?: boolean }>(backend)
  return backend.isWebGPUBackend === true
}
