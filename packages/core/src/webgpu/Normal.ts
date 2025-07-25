import type { ShaderNodeObject } from 'three/tsl'
import type { Node } from 'three/webgpu'

import { Fnv } from './Fnv'

export const normal = /*#__PURE__*/ Fnv((normal: ShaderNodeObject<Node>) => {
  return normal.mul(0.5).add(0.5)
})
