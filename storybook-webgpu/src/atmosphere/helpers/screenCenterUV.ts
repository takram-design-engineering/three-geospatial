import {
  Discard,
  If,
  or,
  screenSize,
  screenUV,
  vec2,
  type ShaderNodeObject
} from 'three/tsl'
import type { Node } from 'three/webgpu'

import { Fnv } from '@takram/three-geospatial/webgpu'

export const screenCenterUV = Fnv(
  (size: ShaderNodeObject<Node>, zoom: ShaderNodeObject<Node>) => {
    const scale = screenSize.div(size).div(zoom).toVar()
    const uv = screenUV.mul(scale).add(scale.oneMinus().mul(0.5)).toVar()
    If(
      or(
        uv.x.lessThan(0),
        uv.x.greaterThan(1),
        uv.y.lessThan(0),
        uv.y.greaterThan(1)
      ),
      () => {
        Discard()
      }
    )
    return vec2(uv.x, uv.y.oneMinus())
  }
)
