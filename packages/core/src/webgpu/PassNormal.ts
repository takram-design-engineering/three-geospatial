import type { Vector3 } from 'three'

import { Fnv } from './Fnv'
import type { Node, ShaderNode } from './types'

export const passNormal = /*#__PURE__*/ Fnv(
  (normal: ShaderNode<Vector3>): Node<Vector3> => {
    return normal.mul(0.5).add(0.5)
  }
)
