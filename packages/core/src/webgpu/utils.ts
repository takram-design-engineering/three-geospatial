import { hashArray, hashString } from 'three/src/nodes/core/NodeUtils.js'
import { OnObjectUpdate } from 'three/tsl'
import {
  NodeBuilder,
  NodeUpdateType,
  type Node,
  type NodeFrame,
  type Renderer,
  type StorageBufferNode
} from 'three/webgpu'

import { reinterpretType } from '../types'

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

// TODO: File a PR in three.js
export const OnBeforeFrame = (callback: (frame: NodeFrame) => void): Node => {
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

export function hash(...params: Array<number | boolean | string>): number {
  return hashArray(
    params.map(value =>
      typeof value === 'number'
        ? value
        : typeof value === 'boolean'
          ? +value
          : typeof value === 'string'
            ? hashString(value)
            : value
    )
  )
}
