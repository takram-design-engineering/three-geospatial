import { Vector3, type Color } from 'three'
import { uniform, vec4 } from 'three/tsl'
import { TempNode, type Node, type NodeBuilder } from 'three/webgpu'

import { FnLayout } from '@takram/three-geospatial/webgpu'

import { convertSRGBToLinear } from './internals'
import { REC709_LUMA_COEFFICIENTS } from './Rec709'

const vectorScratch = /*#__PURE__*/ new Vector3()

const liftGammaGainFn = /*#__PURE__*/ FnLayout({
  name: 'lightGammaGain',
  type: 'vec3',
  inputs: [
    { name: 'input', type: 'vec3' },
    { name: 'lift', type: 'vec3' }, // offset
    { name: 'gamma', type: 'vec3' }, // power
    { name: 'gain', type: 'vec3' } // slope
  ]
})(([input, lift, gamma, gain]) => {
  const color = input.mul(gain).add(lift)
  return color.abs().pow(gamma).mul(color.sign())
})

export class LiftGammaGainNode extends TempNode {
  inputNode: Node

  lift = uniform(new Vector3())
  gamma = uniform(new Vector3().setScalar(1))
  gain = uniform(new Vector3().setScalar(1))

  constructor(inputNode: Node) {
    super('vec4')
    this.inputNode = inputNode
  }

  // LGG to ASC CDL conversion taken from: https://github.com/Unity-Technologies/Graphics/blob/v10.10.2/com.unity.render-pipelines.core/Runtime/Utilities/ColorUtils.cs#L135
  // There's no consensus about the algorithm for LGG.

  setLift(value: Vector3 | Color, offset = 0): this {
    const linear = convertSRGBToLinear(value, vectorScratch)
    const luma = linear.dot(REC709_LUMA_COEFFICIENTS)
    this.lift.value.set(
      linear.x * 0.15 - luma + offset,
      linear.y * 0.15 - luma + offset,
      linear.z * 0.15 - luma + offset
    )
    return this
  }

  setGamma(value: Vector3 | Color, offset = 0): this {
    const linear = convertSRGBToLinear(value, vectorScratch)
    const luma = linear.dot(REC709_LUMA_COEFFICIENTS)
    this.gamma.value.set(
      1 / Math.max(linear.x * 0.8 - luma + (offset + 1), 1e-3),
      1 / Math.max(linear.y * 0.8 - luma + (offset + 1), 1e-3),
      1 / Math.max(linear.z * 0.8 - luma + (offset + 1), 1e-3)
    )
    return this
  }

  setGain(value: Vector3 | Color, offset = 0): this {
    const linear = convertSRGBToLinear(value, vectorScratch)
    const luma = linear.dot(REC709_LUMA_COEFFICIENTS)
    this.gain.value.set(
      linear.x * 0.8 - luma + (offset + 1),
      linear.y * 0.8 - luma + (offset + 1),
      linear.z * 0.8 - luma + (offset + 1)
    )
    return this
  }

  override setup(builder: NodeBuilder): unknown {
    return vec4(
      liftGammaGainFn(this.inputNode.rgb, this.lift, this.gamma, this.gain),
      this.inputNode.a
    )
  }
}

export const liftGammaGain = (
  ...args: ConstructorParameters<typeof LiftGammaGainNode>
): LiftGammaGainNode => new LiftGammaGainNode(...args)
