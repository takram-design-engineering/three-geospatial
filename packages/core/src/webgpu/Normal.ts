import type { Vector3 } from 'three'

import type { Node } from './types'

export const normal = (normal: Node<Vector3>): Node<Vector3> => {
  return normal.mul(0.5).add(0.5)
}
