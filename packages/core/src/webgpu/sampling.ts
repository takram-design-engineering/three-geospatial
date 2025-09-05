import {
  add,
  floor,
  int,
  nodeObject,
  sub,
  textureSize,
  vec2,
  vec4
} from 'three/tsl'
import type { TextureNode } from 'three/webgpu'

import { FnVar } from './FnVar'
import type { NodeObject } from './node'

// 5-taps version of bicubic sampling.
// Reference: https://www.shadertoy.com/view/MtVGWz
export const textureBicubic = /*#__PURE__*/ FnVar(
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

// 9-taps version of Catmull-Rom sampling.
// Reference: https://gist.github.com/TheRealMJP/c83b8c0f46b63f3a88a5986f4fa982b1
export const textureCatmullRom = /*#__PURE__*/ FnVar(
  (textureNode: TextureNode, uv: NodeObject<'vec2'>): NodeObject<'vec4'> => {
    const texSize = vec2(textureSize(textureNode, int(0)))

    // We're going to sample a a 4x4 grid of texels surrounding the target UV
    // coordinate. We'll do this by rounding down the sample location to get the
    // exact center of our "starting" texel. The starting texel will be at
    // location [1, 1] in the grid, where [0, 0] is the top left corner.
    const samplePos = uv.mul(texSize)
    const texPos1 = floor(samplePos.sub(0.5)).add(0.5)

    // Compute the fractional offset from our starting texel to our original
    // sample location, which we'll feed into the Catmull-Rom spline function to
    // get our filter weights.
    const f = samplePos.sub(texPos1)

    // Compute the Catmull-Rom weights using the fractional offset that we
    // calculated earlier. These equations are pre-expanded based on our
    // knowledge of where the texels will be located, which lets us avoid having
    // to evaluate a piece-wise function.
    const w0 = f.mul(f.mul(f.mul(0.5).oneMinus()).sub(0.5))
    const w1 = f.mul(f).mul(f.mul(1.5).sub(2.5)).add(1)
    const w2 = f.mul(f.mul(sub(2, f.mul(1.5))).add(0.5))
    const w3 = f.mul(f).mul(f.mul(0.5).sub(0.5))

    // Work out weighting factors and sampling offsets that will let us use
    // bilinear filtering to simultaneously evaluate the middle 2 samples from
    // the 4x4 grid.
    const w12 = w1.add(w2)
    const offset12 = w2.div(w1.add(w2))

    // Compute the final UV coordinates we'll use for sampling the texture
    const texPos0 = texPos1.sub(1).div(texSize)
    const texPos3 = texPos1.add(2).div(texSize)
    const texPos12 = texPos1.add(offset12).div(texSize)
    return add(
      textureNode.sample(vec2(texPos0.x, texPos0.y)).mul(w0.x).mul(w0.y),
      textureNode.sample(vec2(texPos12.x, texPos0.y)).mul(w12.x).mul(w0.y),
      textureNode.sample(vec2(texPos3.x, texPos0.y)).mul(w3.x).mul(w0.y),
      textureNode.sample(vec2(texPos0.x, texPos12.y)).mul(w0.x).mul(w12.y),
      textureNode.sample(vec2(texPos12.x, texPos12.y)).mul(w12.x).mul(w12.y),
      textureNode.sample(vec2(texPos3.x, texPos12.y)).mul(w3.x).mul(w12.y),
      textureNode.sample(vec2(texPos0.x, texPos3.y)).mul(w0.x).mul(w3.y),
      textureNode.sample(vec2(texPos12.x, texPos3.y)).mul(w12.x).mul(w3.y),
      textureNode.sample(vec2(texPos3.x, texPos3.y)).mul(w3.x).mul(w3.y)
    )
  }
)
