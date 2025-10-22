import {
  abs,
  equirectUV,
  Fn,
  fwidth,
  If,
  remap,
  screenCoordinate,
  smoothstep,
  time,
  vec2,
  vec3
} from 'three/tsl'

import { remap as remapNumber } from '../math'
import { rec709YCbCrToLinear } from './color'
import { FnLayout } from './FnLayout'
import type { NodeObject } from './node'

// Reference: https://advances.realtimerendering.com/s2014/index.html
export const interleavedGradientNoise = (
  seed: NodeObject<'vec2'>
): NodeObject<'float'> => {
  return seed.dot(vec2(0.06711056, 0.00583715)).fract().mul(52.9829189).fract()
}

// Reference (sixth from the bottom): https://www.shadertoy.com/view/MslGR8
export const dithering: NodeObject<'vec3'> = /*#__PURE__*/ Fn(() => {
  const seed = vec2(screenCoordinate.xy).add(time.fract().mul(1337))
  const noise = interleavedGradientNoise(seed)
  return vec3(noise, noise.oneMinus(), noise).sub(0.5).div(255)
}).once()()

export const equirectGrid = (
  direction: NodeObject<'vec3'>,
  lineWidth: NodeObject<'float'>,
  count: NodeObject<'vec2'> = vec2(90, 45)
): NodeObject<'float'> => {
  const uv = equirectUV(direction)
  const deltaUV = fwidth(uv)
  const width = lineWidth.mul(deltaUV).mul(0.5)
  const distance = abs(uv.mul(count).fract().sub(0.5)).div(count)
  const mask = smoothstep(width, width.add(deltaUV), distance).oneMinus()
  return mask.x.add(mask.y).clamp(0, 1)
}

function yCbCr10bit(y: number, cb: number, cr: number): NodeObject<'vec3'> {
  return rec709YCbCrToLinear(
    vec3(
      remapNumber(y, 64, 940, 0, 1),
      remapNumber(cb, 64, 960, -0.5, 0.5),
      remapNumber(cr, 64, 960, -0.5, 0.5)
    )
  )
}

// Based on: https://pub.smpte.org/latest/rp219/Rp219-2002.pdf
export const colorBars = /*#__PURE__*/ FnLayout({
  name: 'colorBars',
  type: 'vec3',
  inputs: [{ name: 'uv', type: 'vec2' }]
})(([uv]) => {
  const d = 1 / 8
  const c = 3 / 4 / 7

  const output = vec3().toVar()
  If(uv.greaterThanEqual(0).all().and(uv.lessThanEqual(1).all()), () => {
    If(uv.y.lessThan(7 / 12), () => {
      If(uv.x.lessThan(d), () => {
        output.assign(yCbCr10bit(414, 512, 512)) // 40% Gray
      })
        .ElseIf(uv.x.lessThan(d + c), () => {
          output.assign(yCbCr10bit(721, 512, 512)) // 75% White
        })
        .ElseIf(uv.x.lessThan(d + c * 2), () => {
          output.assign(yCbCr10bit(674, 176, 543)) // Yellow
        })
        .ElseIf(uv.x.lessThan(d + c * 3), () => {
          output.assign(yCbCr10bit(581, 589, 176)) // Cyan
        })
        .ElseIf(uv.x.lessThan(d + c * 4), () => {
          output.assign(yCbCr10bit(534, 253, 207)) // Green
        })
        .ElseIf(uv.x.lessThan(d + c * 5), () => {
          output.assign(yCbCr10bit(251, 771, 817)) // Magenta
        })
        .ElseIf(uv.x.lessThan(d + c * 6), () => {
          output.assign(yCbCr10bit(204, 435, 848)) // Red
        })
        .ElseIf(uv.x.lessThan(d + c * 7), () => {
          output.assign(yCbCr10bit(111, 848, 481)) // Blue
        })
        .Else(() => {
          output.assign(yCbCr10bit(414, 512, 512)) // 40% Gray
        })
    })
      .ElseIf(uv.y.lessThan(8 / 12), () => {
        If(uv.x.lessThan(d), () => {
          output.assign(yCbCr10bit(754, 615, 64)) // 100% Cyan
        })
          .ElseIf(uv.x.lessThan(d + c), () => {
            output.assign(yCbCr10bit(244, 612, 395)) // -I Signal
          })
          .ElseIf(uv.x.lessThan(d + c * 7), () => {
            output.assign(yCbCr10bit(721, 512, 512)) // 75% White
          })
          .Else(() => {
            output.assign(yCbCr10bit(127, 960, 471)) // 100% Blue
          })
      })
      .ElseIf(uv.y.lessThan(9 / 12), () => {
        If(uv.x.lessThan(d), () => {
          output.assign(yCbCr10bit(877, 64, 533)) // 100% Yellow
        })
          .ElseIf(uv.x.lessThan(d + c), () => {
            output.assign(yCbCr10bit(141, 697, 606)) // +Q Signal
          })
          .ElseIf(uv.x.lessThan(d + c * 7), () => {
            // Y-Ramp
            const y = remap(uv.x, d + c, d + c * 7, 0, 1)
            output.assign(rec709YCbCrToLinear(vec3(y, 0, 0)))
          })
          .Else(() => {
            output.assign(yCbCr10bit(250, 409, 960)) // 100% Red
          })
      })
      .Else(() => {
        If(uv.x.lessThan(d), () => {
          output.assign(yCbCr10bit(195, 512, 512)) // 15% Gray
        })
          .ElseIf(uv.x.lessThan(d + c * 1.5), () => {
            output.assign(yCbCr10bit(64, 512, 512)) // 0% Black
          })
          .ElseIf(uv.x.lessThan(d + c * 3.5), () => {
            output.assign(yCbCr10bit(940, 512, 512)) // 100% White
          })
          .ElseIf(uv.x.lessThan(d + c * (3.5 + 5 / 6)), () => {
            output.assign(yCbCr10bit(64, 512, 512)) // 0% Black
          })
          .ElseIf(uv.x.lessThan(d + c * (3.5 + 5 / 6 + 1 / 3)), () => {
            output.assign(yCbCr10bit(46, 512, 512)) // -2% Black (TODO)
          })
          .ElseIf(uv.x.lessThan(d + c * 5), () => {
            output.assign(yCbCr10bit(64, 512, 512)) // 0% Black
          })
          .ElseIf(uv.x.lessThan(d + c * (5 + 1 / 3)), () => {
            output.assign(yCbCr10bit(82, 512, 512)) // 2% Black
          })
          .ElseIf(uv.x.lessThan(d + c * (5 + 2 / 3)), () => {
            output.assign(yCbCr10bit(64, 512, 512)) // 0% Black
          })
          .ElseIf(uv.x.lessThan(d + c * 6), () => {
            output.assign(yCbCr10bit(99, 512, 512)) // 4% Black
          })
          .ElseIf(uv.x.lessThan(d + c * 7), () => {
            output.assign(yCbCr10bit(64, 512, 512)) // 0% Black
          })
          .Else(() => {
            output.assign(yCbCr10bit(195, 512, 512)) // 15% Gray
          })
      })
  })
  return output
})
