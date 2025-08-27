// Taken from https://gist.github.com/TheRealMJP/c83b8c0f46b63f3a88a5986f4fa982b1
// TODO: Use 5-taps version: https://www.shadertoy.com/view/MtVGWz
// Or even 4 taps (requires preprocessing in the input buffer):
// https://www.shadertoy.com/view/4tyGDD

import { add, floor, int, sub, textureSize, vec2 } from 'three/tsl'
import type { TextureNode } from 'three/webgpu'

import { FnVar } from './FnVar'
import type { Node, NodeObject } from './node'

/**
 * MIT License
 *
 * Copyright (c) 2019 MJP
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

export const textureCatmullRom = /*#__PURE__*/ FnVar(
  (textureNode: TextureNode, uv: NodeObject<'vec2'>): Node<'vec4'> => {
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
