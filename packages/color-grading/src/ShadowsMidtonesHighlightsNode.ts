import { Vector3, type Color } from 'three'
import { add, smoothstep, uniform, vec3, vec4 } from 'three/tsl'
import {
  TempNode,
  type Node,
  type NodeBuilder,
  type UniformNode
} from 'three/webgpu'
import invariant from 'tiny-invariant'

import { FnLayout } from '@takram/three-geospatial/webgpu'

import { convertSRGBToLinear } from './internals'
import { REC709_LUMA_COEFFICIENTS } from './Rec709'

const vectorScratch = /*#__PURE__*/ new Vector3()

const shadowsMidtonesHighlightsFn = /*#__PURE__*/ FnLayout({
  name: 'shadowsMidtonesHighlights',
  type: 'vec3',
  inputs: [
    { name: 'input', type: 'vec3' },
    { name: 'shadows', type: 'vec3' },
    { name: 'midtones', type: 'vec3' },
    { name: 'highlights', type: 'vec3' }
  ]
})(([input, shadows, midtones, highlights]) => {
  const luma = input.dot(vec3(REC709_LUMA_COEFFICIENTS))
  const shadowsFactor = smoothstep(0, 0.333, luma).oneMinus()
  const highlightsFactor = smoothstep(0.55, 1, luma)
  const midtonesFactor = shadowsFactor.add(highlightsFactor).oneMinus()
  return add(
    input.mul(shadowsFactor, shadows),
    input.mul(midtonesFactor, midtones),
    input.mul(highlightsFactor, highlights)
  )
})

export class ShadowsMidtonesHighlightsNode extends TempNode {
  inputNode?: Node | null

  shadows = uniform(new Vector3().setScalar(1))
  midtones = uniform(new Vector3().setScalar(1))
  highlights = uniform(new Vector3().setScalar(1))

  constructor(inputNode?: Node | null) {
    super('vec4')
    this.inputNode = inputNode
  }

  setInputNode(value: Node | null): this {
    this.inputNode = value
    return this
  }

  private setParam(
    uniform: UniformNode<Vector3>,
    color: Vector3 | Color,
    offset = 0
  ): this {
    const linear = convertSRGBToLinear(color, vectorScratch)
    const weight = offset * (Math.sign(offset) < 0 ? 1 : 4)
    uniform.value.set(
      Math.max(linear.x + weight, 0),
      Math.max(linear.y + weight, 0),
      Math.max(linear.z + weight, 0)
    )
    return this
  }

  setShadows(color: Vector3 | Color, offset?: number): this {
    return this.setParam(this.shadows, color, offset)
  }

  setMidtones(color: Vector3 | Color, offset?: number): this {
    return this.setParam(this.midtones, color, offset)
  }

  setHighlights(color: Vector3 | Color, offset?: number): this {
    return this.setParam(this.highlights, color, offset)
  }

  override setup(builder: NodeBuilder): unknown {
    const { inputNode } = this
    invariant(inputNode != null)

    return vec4(
      shadowsMidtonesHighlightsFn(
        inputNode.rgb,
        this.shadows,
        this.midtones,
        this.highlights
      ),
      inputNode.a
    )
  }
}

export const shadowsMidtonesHighlights = (
  ...args: ConstructorParameters<typeof ShadowsMidtonesHighlightsNode>
): ShadowsMidtonesHighlightsNode => new ShadowsMidtonesHighlightsNode(...args)
