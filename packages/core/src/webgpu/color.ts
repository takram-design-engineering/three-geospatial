/* eslint-disable @typescript-eslint/naming-convention */

import {
  add,
  div,
  min,
  mul,
  overloadingFn,
  pow,
  select,
  sub,
  vec3,
  vec4
} from 'three/tsl'

import { FnLayout } from './FnLayout'

const hue2rgb = /*#__PURE__*/ FnLayout({
  name: 'hue2rgb',
  type: 'vec3',
  inputs: [{ name: 'hue', type: 'float' }]
})(([hue]) => {
  const r = hue.mul(6).sub(3).abs().sub(1)
  const g = sub(2, hue.mul(6).sub(2).abs())
  const b = sub(2, hue.mul(6).sub(4).abs())
  return vec3(r, g, b).saturate()
})

// Reference: https://github.com/patriciogonzalezvivo/lygia/blob/main/color/space/hsv2rgb.glsl
export const hsv2rgb = /*#__PURE__*/ FnLayout({
  name: 'hsv2rgb',
  type: 'vec3',
  inputs: [{ name: 'hsv', type: 'vec3' }]
})(([hsv]) => {
  return hue2rgb(hsv.x).sub(1).mul(hsv.y).add(1).mul(hsv.z)
})

// Reference: https://github.com/patriciogonzalezvivo/lygia/blob/main/color/space/rgb2hsv.glsl
export const rgb2hsv = /*#__PURE__*/ FnLayout({
  name: 'rgb2hsv',
  type: 'vec3',
  inputs: [{ name: 'c', type: 'vec3' }]
})(([c]) => {
  const eps = 1e-10
  const k = vec4(0, -1 / 3, 2 / 3, -1).toVar()
  const p = select(
    c.g.lessThan(c.b),
    vec4(c.bg, k.wz),
    vec4(c.gb, k.xy)
  ).toVar()
  const q = select(
    c.r.lessThan(p.x),
    vec4(p.xyw, c.r),
    vec4(c.r, p.yzx)
  ).toVar()
  const d = q.x.sub(min(q.w, q.y)).toVar()
  return vec3(
    q.z.add(q.w.sub(q.y).div(d.mul(6).add(eps))).abs(),
    d.div(q.x.add(eps)),
    q.x
  )
})

const rgb2hcv = /*#__PURE__*/ FnLayout({
  name: 'rgb2hcv',
  type: 'vec3',
  inputs: [{ name: 'rgb', type: 'vec3' }]
})(([rgb]) => {
  const eps = 1e-10
  const p = select(
    rgb.g.lessThan(rgb.b),
    vec4(rgb.bg, -1, 2 / 3),
    vec4(rgb.gb, 0, -1 / 3)
  ).toVar()
  const q = select(
    rgb.r.lessThan(p.x),
    vec4(p.xyw, rgb.r),
    vec4(rgb.r, p.yzx)
  ).toVar()
  const c = q.x.sub(min(q.w, q.y)).toVar()
  const h = q.w.sub(q.y).div(c.mul(6).add(eps)).add(q.z).abs()
  return vec3(h, c, q.x)
})

// Reference: https://github.com/patriciogonzalezvivo/lygia/blob/main/color/space/rgb2hsl.glsl
export const rgb2hsl = /*#__PURE__*/ FnLayout({
  name: 'rgb2hsl',
  type: 'vec3',
  inputs: [{ name: 'rgb', type: 'vec3' }]
})(([rgb]) => {
  const eps = 1e-10
  const hcv = rgb2hcv(rgb)
  const l = hcv.z.sub(hcv.y.mul(0.5))
  const s = hcv.y.div(l.mul(2).sub(1).abs().oneMinus().add(eps))
  return vec3(hcv.x, s, l)
})

// Reference: https://github.com/patriciogonzalezvivo/lygia/blob/main/color/space/hsl2rgb.glsl
export const hsl2rgb = /*#__PURE__*/ FnLayout({
  name: 'hsl2rgb',
  type: 'vec3',
  inputs: [{ name: 'hsl', type: 'vec3' }]
})(([hsl]) => {
  const rgb = hue2rgb(hsl.x)
  const c = mul(2, hsl.z).sub(1).abs().oneMinus().mul(hsl.y)
  return rgb.sub(0.5).mul(c).add(hsl.z)
})

// See: https://en.wikipedia.org/wiki/Rec._709
// Note that we assume a linear workflow (as in Three.js) and sRGB color
// primaries, which are equivalent to Rec. 709.

const linearToRec709_float = /*#__PURE__*/ FnLayout({
  name: 'linearToRec709_float',
  type: 'float',
  inputs: [{ name: 'value', type: 'float' }]
})(([value]) => {
  return select(
    value.lessThan(0.018),
    mul(4.5, value),
    mul(1.099, pow(value, 0.45)).sub(0.099)
  )
})

const linearToRec709_vec3 = /*#__PURE__*/ FnLayout({
  name: 'linearToRec709_vec3',
  type: 'vec3',
  inputs: [{ name: 'color', type: 'vec3' }]
})(([color]) => {
  return vec3(
    linearToRec709_float(color.r),
    linearToRec709_float(color.g),
    linearToRec709_float(color.b)
  )
})

export const linearToRec709 = /*#__PURE__*/ overloadingFn([
  // BUG: The returned type is order-dependent.
  linearToRec709_vec3,
  linearToRec709_float
])

const rec709ToLinear_float = /*#__PURE__*/ FnLayout({
  name: 'rec709ToLinear_float',
  type: 'float',
  inputs: [{ name: 'value', type: 'float' }]
})(([value]) => {
  return select(
    value.lessThan(0.081),
    div(value, 4.5),
    pow(add(value, 0.099).div(1.099), 1 / 0.45)
  )
})

const rec709ToLinear_vec3 = /*#__PURE__*/ FnLayout({
  name: 'rec709ToLinear_vec3',
  type: 'vec3',
  inputs: [{ name: 'color', type: 'vec3' }]
})(([color]) => {
  return vec3(
    rec709ToLinear_float(color.r),
    rec709ToLinear_float(color.g),
    rec709ToLinear_float(color.b)
  )
})

export const rec709ToLinear = /*#__PURE__*/ overloadingFn([
  // BUG: The returned type is order-dependent.
  rec709ToLinear_vec3,
  rec709ToLinear_float
])
