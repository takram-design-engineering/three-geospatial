/* eslint-disable @typescript-eslint/naming-convention */
/* cspell:words LogC */

import {
  add,
  div,
  log,
  mat3,
  mul,
  overloadingFn,
  pow,
  select,
  vec3
} from 'three/tsl'
import { Matrix3, type Node } from 'three/webgpu'

import { FnLayout } from '@takram/three-geospatial/webgpu'

import {
  REC709_LUMA_COEFFICIENTS,
  REC709_TO_YCBCR,
  YCBCR_TO_REC709
} from './Rec709'

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

export const luminanceRec709 = /*#__PURE__*/ FnLayout({
  name: 'luminanceRec709',
  type: 'float',
  inputs: [{ name: 'color', type: 'vec3' }]
})(([color]) => color.dot(vec3(REC709_LUMA_COEFFICIENTS)))

export const linearToYCbCr = /*#__PURE__*/ FnLayout({
  name: 'linearToYCbCr',
  type: 'vec3',
  inputs: [{ name: 'color', type: 'vec3' }]
})(([color]) => {
  return mat3(REC709_TO_YCBCR).mul(linearToRec709(color))
})

export const yCbCrToLinear = /*#__PURE__*/ FnLayout({
  name: 'yCbCrToLinearF',
  type: 'vec3',
  inputs: [{ name: 'color', type: 'vec3' }]
})(([color]) => {
  return rec709ToLinear(mat3(YCBCR_TO_REC709).mul(color))
})

// See: https://en.wikipedia.org/wiki/SRGB
// prettier-ignore
export const LINEAR_TO_XYZ = /*#__PURE__*/ new Matrix3(
  0.4124, 0.3576, 0.1805,
  0.2126, 0.7152, 0.0722,
  0.0193, 0.1192, 0.9505
)

export const XYZ_TO_LINEAR = /*#__PURE__*/ new Matrix3()
  .copy(LINEAR_TO_XYZ)
  .invert()

// See: https://en.wikipedia.org/wiki/CIECAM02#CAT02
// prettier-ignore
export const XYZ_TO_CAT02 = /*#__PURE__*/ new Matrix3(
  0.7328, 0.4296, -0.1624,
  -0.7036, 1.6975, 0.0061,
  0.003, 0.0136, 0.9834
)

export const CAT02_TO_XYZ = /*#__PURE__*/ new Matrix3()
  .copy(XYZ_TO_CAT02)
  .invert()

// ALEXA LogC El 1000 curve
// See: https://www.arri.com/resource/blob/31918/66f56e6abb6e5b6553929edf9aa7483e/2017-03-alexa-logc-curve-in-vfx-data.pdf
const LOGC_CUT = 0.011361
const LOGC_A = 5.555556
const LOGC_B = 0.047996
const LOGC_C = 0.244161
const LOGC_D = 0.386036
const LOGC_E = 5.301883
const LOGC_F = 0.092814

const log10 = (value: Node): Node => log(value).mul(1 / Math.log(10))

const linearToLogC_float = /*#__PURE__*/ FnLayout({
  name: 'linearToLogC_float',
  type: 'float',
  inputs: [{ name: 'value', type: 'float' }]
})(([value]) => {
  return select(
    value.greaterThan(LOGC_CUT),
    log10(value.mul(LOGC_A).add(LOGC_B).max(0)).mul(LOGC_C).add(LOGC_D),
    value.mul(LOGC_E).add(LOGC_F)
  )
})

const linearToLogC_vec3 = /*#__PURE__*/ FnLayout({
  name: 'linearToLogC_vec3',
  type: 'vec3',
  inputs: [{ name: 'color', type: 'vec3' }]
})(([color]) => {
  return vec3(
    linearToLogC_float(color.r),
    linearToLogC_float(color.g),
    linearToLogC_float(color.b)
  )
})

export const linearToLogC = /*#__PURE__*/ overloadingFn([
  // BUG: The returned type is order-dependent.
  linearToLogC_vec3,
  linearToLogC_float
])

const logCToLinear_float = /*#__PURE__*/ FnLayout({
  name: 'logCToLinear_float',
  type: 'float',
  inputs: [{ name: 'value', type: 'float' }]
})(([value]) => {
  return select(
    value.greaterThan(LOGC_E * LOGC_CUT + LOGC_F),
    pow(10, value.sub(LOGC_D).div(LOGC_C)).sub(LOGC_B).div(LOGC_A),
    value.sub(LOGC_F).div(LOGC_E)
  )
})

const logCToLinear_vec3 = /*#__PURE__*/ FnLayout({
  name: 'logCToLinear_vec3',
  type: 'vec3',
  inputs: [{ name: 'color', type: 'vec3' }]
})(([color]) => {
  return vec3(
    logCToLinear_float(color.r),
    logCToLinear_float(color.g),
    logCToLinear_float(color.b)
  )
})

export const logCToLinear = /*#__PURE__*/ overloadingFn([
  // BUG: The returned type is order-dependent.
  logCToLinear_vec3,
  logCToLinear_float
])
