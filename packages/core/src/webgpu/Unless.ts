import { If } from 'three/tsl'
import type { Node, StackNode } from 'three/webgpu'

export function Unless(boolNode: Node, method: () => void): StackNode {
  return If(boolNode, () => {}).Else(method)
}
