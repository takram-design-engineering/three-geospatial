import {
  mix,
  rand,
  screenCoordinate,
  vec3,
  type ShaderNodeObject
} from 'three/tsl'
import type { Node } from 'three/webgpu'

import { Fnv } from './Fnv'

export const dithering = /*#__PURE__*/ Fnv((color: ShaderNodeObject<Node>) => {
  const gridPosition = rand(screenCoordinate.xy)
  const ditherShift = vec3(0.25, -0.25, 0.25).div(255).toConst()
  return color.add(mix(ditherShift.mul(2), ditherShift.mul(-2), gridPosition))
})
