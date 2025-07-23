import { Fn, type ShaderNodeObject } from 'three/src/nodes/TSL.js'
import type { Node } from 'three/webgpu'

export const normal = /*#__PURE__*/ Fn<[ShaderNodeObject<Node>]>(([normal]) => {
  return normal.mul(0.5).add(0.5)
})
