import { mix, rand, screenCoordinate, vec3 } from 'three/tsl'

import { Fnv } from './Fnv'
import type { Node } from './node'

export const dithering = /*#__PURE__*/ Fnv((): Node<'vec3' | 'vec4'> => {
  const gridPosition = rand(screenCoordinate.xy)
  const ditherShift = vec3(0.25, -0.25, 0.25).div(255).toConst()
  return mix(ditherShift.mul(2), ditherShift.mul(-2), gridPosition)
})
