import {
  Discard,
  float,
  fract,
  If,
  int,
  ivec2,
  screenSize,
  screenUV,
  vec2,
  vec3,
  type ShaderNodeObject
} from 'three/tsl'
import type { Node } from 'three/webgpu'

import { Fnv } from '@takram/three-geospatial/webgpu'

export const wrapTileUVW = Fnv(
  (size: ShaderNodeObject<Node>, zoom: ShaderNodeObject<Node>) => {
    const uv = vec2(screenUV.x, screenUV.y)
      .mul(screenSize)
      .div(size.xy)
      .div(zoom)
    const xy = ivec2(uv)
    const columns = int(5)
    If(xy.x.greaterThanEqual(columns), () => {
      Discard()
    })
    const index = xy.y.mul(columns).add(xy.x.mod(columns))
    If(index.greaterThanEqual(size.z), () => {
      Discard()
    })
    return vec3(fract(uv), float(index).add(0.5).div(size.z))
  }
)
