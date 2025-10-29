import { If, remap, vec3 } from 'three/tsl'

import { remap as remapNumber } from '@takram/three-geospatial'
import { FnLayout, type NodeObject } from '@takram/three-geospatial/webgpu'

import { rec709YCbCrToLinear } from './colors'

function yCbCr10(y: number, cb: number, cr: number): NodeObject<'vec3'> {
  return rec709YCbCrToLinear(
    vec3(
      remapNumber(y, 64, 940, 0, 1),
      remapNumber(cb, 64, 960, -0.5, 0.5),
      remapNumber(cr, 64, 960, -0.5, 0.5)
    )
  )
}

// Conforms to: https://pub.smpte.org/pub/eg1/eg0001-1990_stable2004.pdf
export const colorBarsSD = /*#__PURE__*/ FnLayout({
  name: 'colorBarsSD',
  type: 'vec3',
  inputs: [{ name: 'uv', type: 'vec2' }]
})(([uv]) => {
  const b = 1 / 7

  const output = vec3(0).toVar()
  If(uv.greaterThanEqual(0).all().and(uv.lessThanEqual(1).all()), () => {
    If(uv.y.lessThan(2 / 3), () => {
      If(uv.x.lessThan(b), () => {
        output.assign(yCbCr10(721, 512, 512)) // Gray
      })
        .ElseIf(uv.x.lessThan(b * 2), () => {
          output.assign(yCbCr10(674, 176, 543)) // Yellow
        })
        .ElseIf(uv.x.lessThan(b * 3), () => {
          output.assign(yCbCr10(581, 589, 176)) // Cyan
        })
        .ElseIf(uv.x.lessThan(b * 4), () => {
          output.assign(yCbCr10(534, 253, 207)) // Green
        })
        .ElseIf(uv.x.lessThan(b * 5), () => {
          output.assign(yCbCr10(251, 771, 817)) // Magenta
        })
        .ElseIf(uv.x.lessThan(b * 6), () => {
          output.assign(yCbCr10(204, 435, 848)) // Red
        })
        .Else(() => {
          output.assign(yCbCr10(111, 848, 481)) // Blue
        })
    })
      .ElseIf(uv.y.lessThan(9 / 12), () => {
        If(uv.x.lessThan(b), () => {
          output.assign(yCbCr10(111, 848, 481)) // Blue
        })
          .ElseIf(uv.x.lessThan(b * 2), () => {
            output.assign(yCbCr10(64, 512, 512)) // Black
          })
          .ElseIf(uv.x.lessThan(b * 3), () => {
            output.assign(yCbCr10(251, 771, 817)) // Magenta
          })
          .ElseIf(uv.x.lessThan(b * 4), () => {
            output.assign(yCbCr10(64, 512, 512)) // Black
          })
          .ElseIf(uv.x.lessThan(b * 5), () => {
            output.assign(yCbCr10(581, 589, 176)) // Cyan
          })
          .ElseIf(uv.x.lessThan(b * 6), () => {
            output.assign(yCbCr10(64, 512, 512)) // Black
          })
          .Else(() => {
            output.assign(yCbCr10(721, 512, 512)) // Gray
          })
      })
      .Else(() => {
        If(uv.x.lessThan(b * (5 / 4)), () => {
          output.assign(yCbCr10(244, 612, 395)) // -I
        })
          .ElseIf(uv.x.lessThan(b * (5 / 4) * 2), () => {
            output.assign(yCbCr10(940, 512, 512)) // White
          })
          .ElseIf(uv.x.lessThan(b * (5 / 4) * 3), () => {
            output.assign(yCbCr10(141, 697, 606)) // +Q
          })
          .ElseIf(uv.x.lessThan(b * 5), () => {
            output.assign(yCbCr10(64, 512, 512)) // Black
          })
          .ElseIf(uv.x.lessThan(b * (5 + 1 / 3)), () => {
            output.assign(yCbCr10(29, 512, 512)) // -4% Black
          })
          .ElseIf(uv.x.lessThan(b * (5 + 2 / 3)), () => {
            output.assign(yCbCr10(64, 512, 512)) // Black
          })
          .ElseIf(uv.x.lessThan(b * 6), () => {
            output.assign(yCbCr10(99, 512, 512)) // 4% Black
          })
          .Else(() => {
            output.assign(yCbCr10(64, 512, 512)) // Black
          })
      })
  })
  return output
})

// Conforms to: https://pub.smpte.org/latest/rp219/Rp219-2002.pdf
export const colorBarsHD = /*#__PURE__*/ FnLayout({
  name: 'colorBarsHD',
  type: 'vec3',
  inputs: [{ name: 'uv', type: 'vec2' }]
})(([uv]) => {
  const d = 1 / 8
  const c = 3 / 4 / 7

  const output = vec3(0).toVar()
  If(uv.greaterThanEqual(0).all().and(uv.lessThanEqual(1).all()), () => {
    If(uv.y.lessThan(7 / 12), () => {
      If(uv.x.lessThan(d), () => {
        output.assign(yCbCr10(414, 512, 512)) // 40% Gray
      })
        .ElseIf(uv.x.lessThan(d + c), () => {
          output.assign(yCbCr10(721, 512, 512)) // 75% White
        })
        .ElseIf(uv.x.lessThan(d + c * 2), () => {
          output.assign(yCbCr10(674, 176, 543)) // Yellow
        })
        .ElseIf(uv.x.lessThan(d + c * 3), () => {
          output.assign(yCbCr10(581, 589, 176)) // Cyan
        })
        .ElseIf(uv.x.lessThan(d + c * 4), () => {
          output.assign(yCbCr10(534, 253, 207)) // Green
        })
        .ElseIf(uv.x.lessThan(d + c * 5), () => {
          output.assign(yCbCr10(251, 771, 817)) // Magenta
        })
        .ElseIf(uv.x.lessThan(d + c * 6), () => {
          output.assign(yCbCr10(204, 435, 848)) // Red
        })
        .ElseIf(uv.x.lessThan(d + c * 7), () => {
          output.assign(yCbCr10(111, 848, 481)) // Blue
        })
        .Else(() => {
          output.assign(yCbCr10(414, 512, 512)) // 40% Gray
        })
    })
      .ElseIf(uv.y.lessThan(8 / 12), () => {
        If(uv.x.lessThan(d), () => {
          output.assign(yCbCr10(754, 615, 64)) // 100% Cyan
        })
          .ElseIf(uv.x.lessThan(d + c), () => {
            output.assign(yCbCr10(244, 612, 395)) // -I Signal
          })
          .ElseIf(uv.x.lessThan(d + c * 7), () => {
            output.assign(yCbCr10(721, 512, 512)) // 75% White
          })
          .Else(() => {
            output.assign(yCbCr10(127, 960, 471)) // 100% Blue
          })
      })
      .ElseIf(uv.y.lessThan(9 / 12), () => {
        If(uv.x.lessThan(d), () => {
          output.assign(yCbCr10(877, 64, 553)) // 100% Yellow
        })
          .ElseIf(uv.x.lessThan(d + c), () => {
            output.assign(yCbCr10(141, 697, 606)) // +Q Signal
          })
          .ElseIf(uv.x.lessThan(d + c * 7), () => {
            // Y-Ramp
            const y = remap(uv.x, d + c, d + c * 7, 0, 1)
            output.assign(rec709YCbCrToLinear(vec3(y, 0, 0)))
          })
          .Else(() => {
            output.assign(yCbCr10(250, 409, 960)) // 100% Red
          })
      })
      .Else(() => {
        If(uv.x.lessThan(d), () => {
          output.assign(yCbCr10(195, 512, 512)) // 15% Gray
        })
          .ElseIf(uv.x.lessThan(d + c * 1.5), () => {
            output.assign(yCbCr10(64, 512, 512)) // 0% Black
          })
          .ElseIf(uv.x.lessThan(d + c * 3.5), () => {
            output.assign(yCbCr10(940, 512, 512)) // 100% White
          })
          .ElseIf(uv.x.lessThan(d + c * (3.5 + 5 / 6)), () => {
            output.assign(yCbCr10(64, 512, 512)) // 0% Black
          })
          .ElseIf(uv.x.lessThan(d + c * (3.5 + 5 / 6 + 1 / 3)), () => {
            output.assign(yCbCr10(46, 512, 512)) // -2% Black
          })
          .ElseIf(uv.x.lessThan(d + c * 5), () => {
            output.assign(yCbCr10(64, 512, 512)) // 0% Black
          })
          .ElseIf(uv.x.lessThan(d + c * (5 + 1 / 3)), () => {
            output.assign(yCbCr10(82, 512, 512)) // 2% Black
          })
          .ElseIf(uv.x.lessThan(d + c * (5 + 2 / 3)), () => {
            output.assign(yCbCr10(64, 512, 512)) // 0% Black
          })
          .ElseIf(uv.x.lessThan(d + c * 6), () => {
            output.assign(yCbCr10(99, 512, 512)) // 4% Black
          })
          .ElseIf(uv.x.lessThan(d + c * 7), () => {
            output.assign(yCbCr10(64, 512, 512)) // 0% Black
          })
          .Else(() => {
            output.assign(yCbCr10(195, 512, 512)) // 15% Gray
          })
      })
  })
  return output
})
