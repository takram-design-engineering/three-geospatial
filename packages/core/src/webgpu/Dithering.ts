import { Fn, type ShaderNodeObject } from 'three/src/nodes/TSL.js'
import { mix, rand, screenCoordinate, vec3 } from 'three/tsl'
import type { Node } from 'three/webgpu'

export const dithering = /*#__PURE__*/ Fn<[ShaderNodeObject<Node>]>(
  ([color]) => {
    const gridPosition = rand(screenCoordinate.xy)
    const ditherShift = vec3(0.25, -0.25, 0.25).div(255).toConst()
    return color.add(mix(ditherShift.mul(2), ditherShift.mul(-2), gridPosition))
  }
)
