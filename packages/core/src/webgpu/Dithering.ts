import type { Vector3, Vector4 } from 'three'
import { mix, rand, screenCoordinate, vec3 } from 'three/tsl'

import { Fnv } from './Fnv'
import type { Node, ShaderNode } from './types'

export const dithering = /*#__PURE__*/ Fnv(
  (color: ShaderNode<Vector3 | Vector4>): Node<Vector3 | Vector4> => {
    const gridPosition = rand(screenCoordinate.xy)
    const ditherShift = vec3(0.25, -0.25, 0.25).div(255).toConst()
    return color.add(mix(ditherShift.mul(2), ditherShift.mul(-2), gridPosition))
  }
)
