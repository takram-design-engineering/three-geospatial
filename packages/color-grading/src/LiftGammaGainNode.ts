import { Vector3, type Color } from 'three'
import { select, uniform, vec3, vec4 } from 'three/tsl'
import { TempNode, type Node, type NodeBuilder } from 'three/webgpu'
import invariant from 'tiny-invariant'

import { FnLayout } from '@takram/three-geospatial/webgpu'

import { convertSRGBToLinear } from './internals'
import { REC709_LUMA_COEFFICIENTS } from './Rec709'

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
  inputNode?: Node | null

  slope = uniform(new Vector3().setScalar(1))
  offset = uniform(new Vector3())
  power = uniform(new Vector3().setScalar(1))

  constructor(inputNode?: Node | null) {
    super('vec4')
    this.inputNode = inputNode
  }

  setInputNode(value: Node | null): this {
    this.inputNode = value
    return this
  }

  // LGG to ASC CDL conversion taken from: https://github.com/Unity-Technologies/Graphics/blob/v10.10.2/com.unity.render-pipelines.core/Runtime/Utilities/ColorUtils.cs#L135
  // There's no consensus about the algorithm for LGG.

  setLift(color: Vector3 | Color, offset = 0): this {
    const linear = convertSRGBToLinear(color, vectorScratch)
    linear.multiplyScalar(0.15)
    const luma = linear.dot(REC709_LUMA_COEFFICIENTS)
    this.offset.value.set(
      linear.x - luma + offset,
      linear.y - luma + offset,
      linear.z - luma + offset
    )
    return this
  }

  setGamma(color: Vector3 | Color, offset = 0): this {
    const linear = convertSRGBToLinear(color, vectorScratch)
    linear.multiplyScalar(0.8)
    const luma = linear.dot(REC709_LUMA_COEFFICIENTS)
    this.power.value.set(
      1 / Math.max(linear.x - luma + (offset + 1), 1e-5),
      1 / Math.max(linear.y - luma + (offset + 1), 1e-5),
      1 / Math.max(linear.z - luma + (offset + 1), 1e-5)
    )
    return this
  }

  setGain(color: Vector3 | Color, offset = 0): this {
    const linear = convertSRGBToLinear(color, vectorScratch)
    linear.multiplyScalar(0.8)
    const luma = linear.dot(REC709_LUMA_COEFFICIENTS)
    this.slope.value.set(
      linear.x - luma + (offset + 1),
      linear.y - luma + (offset + 1),
      linear.z - luma + (offset + 1)
    )
    return this
  }

  override setup(builder: NodeBuilder): unknown {
    const { inputNode } = this
    invariant(inputNode != null)

    return vec4(
      colorDecisionList(inputNode.rgb, this.slope, this.offset, this.power),
      inputNode.a
    )
  }
}

export const liftGammaGain = (
  ...args: ConstructorParameters<typeof LiftGammaGainNode>
): LiftGammaGainNode => new LiftGammaGainNode(...args)
