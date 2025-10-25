/* eslint-disable @typescript-eslint/naming-convention */

import {
  add,
  div,
  mat3,
  mul,
  overloadingFn,
  pow,
  select,
  vec3
} from 'three/tsl'

import { FnLayout } from '@takram/three-geospatial/webgpu'

// See: https://en.wikipedia.org/wiki/Rec._709
// Note that we assume a linear workflow (as in Three.js) and sRGB color
// primaries, which are equivalent to Rec.709.

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

const Yx = 0.2126
const Yy = 0.7152
const Yz = 0.0722
const Cbx = -0.2126
const Cby = -0.7152
const Cbz = 0.9278
const Cbw = 1.8556
const Crx = 0.7874
const Cry = -0.7152
const Crz = -0.0722
const Crw = 1.5748

// prettier-ignore
const REC709_RGB_TO_YCBCR = /*#__PURE__*/ mat3(
  Yx, Yy, Yz,
  Cbx / Cbw, Cby / Cbw, Cbz / Cbw,
  Crx / Crw, Cry / Crw, Crz / Crw
)

// prettier-ignore
const REC709_YCBCR_TO_RGB = /*#__PURE__*/ mat3(
  1, 0, Crw,
  1, -Yz * Cbw / Yy, -Yx * Crw / Yy,
  1, Cbw, 0
)

export const linearToRec709YCbCr = /*#__PURE__*/ FnLayout({
  name: 'linearToRec709YCbCr',
  type: 'vec3',
  inputs: [{ name: 'color', type: 'vec3' }]
})(([color]) => {
  return REC709_RGB_TO_YCBCR.mul(linearToRec709(color))
})

export const rec709YCbCrToLinear = /*#__PURE__*/ FnLayout({
  name: 'rec709YCbCrToLinear',
  type: 'vec3',
  inputs: [{ name: 'color', type: 'vec3' }]
})(([color]) => {
  return rec709ToLinear(REC709_YCBCR_TO_RGB.mul(color))
})

export const luminanceRec709 = /*#__PURE__*/ FnLayout({
  name: 'luminanceRec709',
  type: 'float',
  inputs: [{ name: 'color', type: 'vec3' }]
})(([color]) => color.dot(vec3(Yx, Yy, Yz)))
