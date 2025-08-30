import { add, nodeObject, sub, textureSize, vec2, vec4 } from 'three/tsl'
import type { TextureNode } from 'three/webgpu'

import { FnVar } from './FnVar'
import type { NodeObject } from './node'

// Reference: https://www.shadertoy.com/view/MtVGWz
export const textureCatmullRom = /*#__PURE__*/ FnVar(
  (
    textureNode: TextureNode,
    uv: NodeObject<'vec2'>,
    sharpness: number | NodeObject<'float'> = 0.4
  ): NodeObject<'vec4'> => {
    const size = vec2(textureSize(textureNode).xy)
    const metrics = vec4(size.reciprocal().xy, size.xy)
    const position = metrics.zw.mul(uv)
    const centerPosition = position.sub(0.5).floor().add(0.5)
    const f = position.sub(centerPosition)
    const f2 = f.mul(f)
    const f3 = f.mul(f2)

    // w0 =      -c  * f3 +  2*c      * f2 - c*f
    // w1 =  (2 - c) * f3 - (3 - c)   * f2       + 1
    // w2 = -(2 - c) * f3 + (3 - 2*c) * f2 + c*f
    // w3 =       c  * f3 -  c        * f2
    const c = nodeObject(sharpness)
    const cf = c.mul(f)
    const w0 = c.negate().mul(f3).add(c.mul(2).mul(f2).sub(cf))
    const w1 = sub(2, c).mul(f3).sub(sub(3, c).mul(f2)).add(1)
    const w2 = sub(2, c)
      .negate()
      .mul(f3)
      .add(sub(3, c.mul(2)).mul(f2))
      .add(cf)
    const w3 = c.mul(f3).sub(c.mul(f2))

    const w12 = w1.add(w2)
    const tc12 = metrics.xy.mul(centerPosition.add(w2.div(w12)))
    const centerColor = textureNode.sample(tc12).rgb
    const tc0 = metrics.xy.mul(centerPosition.sub(1))
    const tc3 = metrics.xy.mul(centerPosition.add(2))
    const color = add(
      vec4(textureNode.sample(vec2(tc12.x, tc0.y)).rgb, 1).mul(w12.x.mul(w0.y)),
      vec4(textureNode.sample(vec2(tc0.x, tc12.y)).rgb, 1).mul(w0.x.mul(w12.y)),
      vec4(centerColor, 1).mul(w12.x.mul(w12.y)),
      vec4(textureNode.sample(vec2(tc3.x, tc12.y)).rgb, 1).mul(w3.x.mul(w12.y)),
      vec4(textureNode.sample(vec2(tc12.x, tc3.y)).rgb, 1).mul(w12.x.mul(w3.y))
    )
    return vec4(color.rgb.div(color.a), 1)
  }
)
