import { Vector3 } from 'three'
import { select, uniform, vec3, vec4 } from 'three/tsl'
import { TempNode, type Node, type NodeBuilder } from 'three/webgpu'
import invariant from 'tiny-invariant'

import { FnLayout } from '@takram/three-geospatial/webgpu'

import { REC709_LUMA_COEFFICIENTS } from './Rec709'
import type { ColorTuple } from './types'
import { convertSRGBToLinear } from './utils'

const vectorScratch = /*#__PURE__*/ new Vector3()

const colorDecisionList = /*#__PURE__*/ FnLayout({
  name: 'colorDecisionList',
  type: 'vec3',
  inputs: [
    { name: 'input', type: 'vec3' },
    { name: 'slope', type: 'vec3' },
    { name: 'offset', type: 'vec3' },
    { name: 'power', type: 'vec3' }
  ]
})(([input, slope, offset, power]) => {
  const v = input.mul(slope).add(offset)
  const p = v.pow(power)
  return vec3(
    select(v.r.lessThanEqual(0), v.r, p.r),
    select(v.g.lessThanEqual(0), v.g, p.g),
    select(v.b.lessThanEqual(0), v.b, p.b)
  )
})

export class LiftGammaGainNode extends TempNode {
  colorLinear?: Node | null

  slope = uniform(new Vector3().setScalar(1))
  offset = uniform(new Vector3())
  power = uniform(new Vector3().setScalar(1))

  constructor(colorLinear?: Node | null) {
    super('vec4')
    this.colorLinear = colorLinear
  }

  setColorLinear(value: Node | null): this {
    this.colorLinear = value
    return this
  }

  // LGG to ASC CDL conversion taken from: https://github.com/Unity-Technologies/Graphics/blob/v10.10.2/com.unity.render-pipelines.core/Runtime/Utilities/ColorUtils.cs#L135
  // There's no consensus about the algorithm for LGG.

  setLift(colorSRGB: ColorTuple, offset = 0): this {
    const colorLinear = convertSRGBToLinear(colorSRGB, vectorScratch)
    colorLinear.multiplyScalar(0.15)
    const luma = colorLinear.dot(REC709_LUMA_COEFFICIENTS)
    this.offset.value.set(
      colorLinear.x - luma + offset,
      colorLinear.y - luma + offset,
      colorLinear.z - luma + offset
    )
    return this
  }

  setGamma(colorSRGB: ColorTuple, offset = 0): this {
    const colorLinear = convertSRGBToLinear(colorSRGB, vectorScratch)
    colorLinear.multiplyScalar(0.8)
    const luma = colorLinear.dot(REC709_LUMA_COEFFICIENTS)
    this.power.value.set(
      1 / Math.max(colorLinear.x - luma + (offset + 1), 1e-5),
      1 / Math.max(colorLinear.y - luma + (offset + 1), 1e-5),
      1 / Math.max(colorLinear.z - luma + (offset + 1), 1e-5)
    )
    return this
  }

  setGain(colorSRGB: ColorTuple, offset = 0): this {
    const colorLinear = convertSRGBToLinear(colorSRGB, vectorScratch)
    colorLinear.multiplyScalar(0.8)
    const luma = colorLinear.dot(REC709_LUMA_COEFFICIENTS)
    this.slope.value.set(
      colorLinear.x - luma + (offset + 1),
      colorLinear.y - luma + (offset + 1),
      colorLinear.z - luma + (offset + 1)
    )
    return this
  }

  override setup(builder: NodeBuilder): unknown {
    const { colorLinear } = this
    invariant(colorLinear != null)

    return vec4(
      colorDecisionList(colorLinear.rgb, this.slope, this.offset, this.power),
      colorLinear.a
    )
  }
}

export const liftGammaGain = (
  ...args: ConstructorParameters<typeof LiftGammaGainNode>
): LiftGammaGainNode => new LiftGammaGainNode(...args)
