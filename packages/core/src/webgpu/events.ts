import { OnBeforeObjectUpdate, OnObjectUpdate } from 'three/tsl'
import { NodeUpdateType, type Node, type NodeFrame } from 'three/webgpu'

// TODO: File a PR for these:

export const OnFrameUpdate = (callback: (frame: NodeFrame) => void): Node => {
  const node = OnObjectUpdate(callback)
  node.updateType = NodeUpdateType.NONE
  return node
}

export const OnBeforeFrameUpdate = (
  callback: (frame: NodeFrame) => void
): Node => {
  const node = OnBeforeObjectUpdate(callback)
  node.updateBeforeType = NodeUpdateType.FRAME
  return node
}
