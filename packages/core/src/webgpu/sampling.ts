import { add, sub, textureSize, vec2 } from 'three/tsl'
import type { TextureNode } from 'three/webgpu'

import { FnVar } from './FnVar'
import type { Node } from './node'

// 9-taps version of Catmull-Rom sampling.
// Reference: https://gist.github.com/TheRealMJP/c83b8c0f46b63f3a88a5986f4fa982b1
export const textureCatmullRom = /*#__PURE__*/ FnVar(
  (textureNode: TextureNode, uv: Node<'vec2'>): Node<'vec4'> => {
    const size = vec2(textureSize(textureNode))
    const texelSize = size.reciprocal()
    const position = uv.mul(size)
    const centerPosition = position.sub(0.5).floor().add(0.5)

    // Compute the fractional offset from our starting texel to our original
    // sample location, which we'll feed into the Catmull-Rom spline function to
    // get our filter weights.
    const f = position.sub(centerPosition)

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
    const texPos0 = centerPosition.sub(1).mul(texelSize)
    const texPos3 = centerPosition.add(2).mul(texelSize)
    const texPos12 = centerPosition.add(offset12).mul(texelSize)

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
