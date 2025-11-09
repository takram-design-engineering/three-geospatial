import { Matrix3, Vector3 } from 'three'
import { mat3, uniform, vec4 } from 'three/tsl'
import { TempNode, type NodeBuilder } from 'three/webgpu'
import invariant from 'tiny-invariant'

import { FnLayout, type Node } from '@takram/three-geospatial/webgpu'

import { XYZ_TO_CAT02 } from './colors'

const vectorScratch = /*#__PURE__*/ new Vector3()

// Y coordinate of the standard illuminant D
// See: https://en.wikipedia.org/wiki/Standard_illuminant#Illuminant_series_D
function getStandardIlluminantY(x: number): number {
  return -3 * x ** 2 + 2.87 * x - 0.275
}

function chromaticityToLMS(
  x: number,
  y: number,
  result = new Vector3()
): Vector3 {
  const Y = 1
  const X = (Y * x) / y
  const Z = (Y * (1 - x - y)) / y
  return result.set(X, Y, Z).applyMatrix3(XYZ_TO_CAT02)
}

// See: https://en.wikipedia.org/wiki/Standard_illuminant#White_point
const D65_WHITE_POINT_X = 0.31272
const D65_WHITE_POINT_Y = 0.32903
const D65_WHITE_POINT_LMS = /*#__PURE__*/ chromaticityToLMS(
  D65_WHITE_POINT_X,
  D65_WHITE_POINT_Y
)

// Taken from: https://github.com/Unity-Technologies/Graphics/blob/v10.10.2/com.unity.render-pipelines.core/ShaderLibrary/Color.hlsl#L261
// TODO: Look into the parameters behind
// prettier-ignore
const LINEAR_TO_LMS = /*#__PURE__*/ new Matrix3(
  3.90405e-1, 5.49941e-1, 8.92632e-3,
  7.08416e-2, 9.63172e-1, 1.35775e-3,
  2.31082e-2, 1.28021e-1, 9.36245e-1
)

// prettier-ignore
const LMS_TO_LINEAR = /*#__PURE__*/ new Matrix3(
  2.85847e+0, -1.62879e+0, -2.48910e-2,
  -2.10182e-1, 1.15820e+0, 3.24281e-4,
  -4.18120e-2, -1.18169e-1, 1.06867e+0
)

const colorBalanceFn = /*#__PURE__*/ FnLayout({
  name: 'colorBalance',
  type: 'vec3',
  inputs: [
    { name: 'color', type: 'vec3' },
    { name: 'lmsCoeffs', type: 'vec3' }
  ]
})(([color, lmsCoeffs]) => {
  const lms = mat3(LINEAR_TO_LMS).mul(color)
  return mat3(LMS_TO_LINEAR).mul(lms.mul(lmsCoeffs))
})

export class ColorBalanceNode extends TempNode {
  inputNode?: Node | null

  lmsCoeffs = uniform(new Vector3().setScalar(1))

  constructor(inputNode?: Node | null) {
    super('vec4')
    this.inputNode = inputNode
  }

  setInputNode(value: Node | null): this {
    this.inputNode = value
    return this
  }

  setParams(temperature: number, tint: number): this {
    // Coefficients taken from: https://github.com/google/filament/blob/v1.67.0/filament/src/details/ColorGrading.cpp#L448
    // Works good for [-1, 1] range parameters.
    const t = temperature
    const x = D65_WHITE_POINT_X - t * (t < 0 ? 0.0214 : 0.066)
    const y = getStandardIlluminantY(x) + tint * 0.066

    this.lmsCoeffs.value
      .copy(D65_WHITE_POINT_LMS)
      .divide(chromaticityToLMS(x, y, vectorScratch))
    return this
  }

  override setup(builder: NodeBuilder): unknown {
    const { inputNode } = this
    invariant(inputNode != null)

    return vec4(colorBalanceFn(inputNode.rgb, this.lmsCoeffs), inputNode.a)
  }
}

export const colorBalance = (
  ...args: ConstructorParameters<typeof ColorBalanceNode>
): ColorBalanceNode => new ColorBalanceNode(...args)
