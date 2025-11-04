import type Backend from 'three/src/renderers/common/Backend.js'
import { OnObjectUpdate } from 'three/tsl'
import {
  NodeBuilder,
  NodeUpdateType,
  type NodeFrame,
  type Renderer,
  type StorageBufferNode
} from 'three/webgpu'

import { reinterpretType } from '../types'
import type { NodeObject } from './node'

export function isWebGPU(target: NodeBuilder | Renderer | Backend): boolean {
  const renderer = target instanceof NodeBuilder ? target.renderer : target
  const backend = 'backend' in renderer ? renderer.backend : target
  // WORKAROUND: The type of Backend cannot be augmented because it is
  // default-exported.
  reinterpretType<Backend & { isWebGPUBackend?: boolean }>(backend)
  return backend.isWebGPUBackend === true
}

// TODO: File a PR in three.js
export const OnBeforeFrame = (
  callback: (frame: NodeFrame) => void
): NodeObject => {
  const node = OnObjectUpdate(callback)
  node.updateType = NodeUpdateType.NONE
  node.updateBeforeType = NodeUpdateType.FRAME
  return node
}

export function resizeStorageBuffer(
  bufferNode: StorageBufferNode,
  count: number
): void {
  const attribute = bufferNode.value
  if (count !== attribute.count) {
    const prevCount = attribute.count * attribute.itemSize
    const nextCount = count * attribute.itemSize
    const array = new Uint32Array(nextCount)
    array.set(
      nextCount < prevCount
        ? attribute.array.subarray(0, nextCount)
        : attribute.array
    )

    reinterpretType<typeof attribute & { count: number }>(attribute)
    attribute.array = array
    attribute.count = count
    bufferNode.bufferCount = count
  }
}
