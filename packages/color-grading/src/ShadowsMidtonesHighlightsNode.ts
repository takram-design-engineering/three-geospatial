import { Vector3 } from 'three'
import { add, smoothstep, uniform, vec3, vec4 } from 'three/tsl'
import {
  TempNode,
  type Node,
  type NodeBuilder,
  type UniformNode
} from 'three/webgpu'
import invariant from 'tiny-invariant'

import { FnLayout } from '@takram/three-geospatial/webgpu'

import { REC709_LUMA_COEFFICIENTS } from './Rec709'
import type { ColorTuple } from './types'
import { convertSRGBToLinear } from './utils'

const vectorScratch = /*#__PURE__*/ new Vector3()

const shadowsMidtonesHighlightsFn = /*#__PURE__*/ FnLayout({
  name: 'shadowsMidtonesHighlights',
  type: 'vec3',
  inputs: [
    { name: 'colorLinear', type: 'vec3' },
    { name: 'shadows', type: 'vec3' },
    { name: 'midtones', type: 'vec3' },
    { name: 'highlights', type: 'vec3' }
  ]
})(([colorLinear, shadows, midtones, highlights]) => {
  const luma = colorLinear.dot(vec3(REC709_LUMA_COEFFICIENTS))
  const shadowsFactor = smoothstep(0, 0.333, luma).oneMinus()
  const highlightsFactor = smoothstep(0.55, 1, luma)
  const midtonesFactor = shadowsFactor.add(highlightsFactor).oneMinus()
  return add(
    colorLinear.mul(shadowsFactor, shadows),
    colorLinear.mul(midtonesFactor, midtones),
    colorLinear.mul(highlightsFactor, highlights)
  )
})

export class ShadowsMidtonesHighlightsNode extends TempNode {
  colorLinear?: Node | null

  shadows = uniform(new Vector3().setScalar(1))
  midtones = uniform(new Vector3().setScalar(1))
  highlights = uniform(new Vector3().setScalar(1))

  constructor(colorLinear?: Node | null) {
    super('vec4')
    this.colorLinear = colorLinear
  }

  setColorLinear(value: Node | null): this {
    this.colorLinear = value
    return this
  }

  private setParam(
    uniform: UniformNode<Vector3>,
    colorSRGB: ColorTuple,
    offset = 0
  ): this {
    const colorLinear = convertSRGBToLinear(colorSRGB, vectorScratch)
    const weight = offset * (Math.sign(offset) < 0 ? 1 : 4)
    uniform.value.set(
      Math.max(colorLinear.x + weight, 0),
      Math.max(colorLinear.y + weight, 0),
      Math.max(colorLinear.z + weight, 0)
    )
    return this
  }

  setShadows(colorSRGB: ColorTuple, offset?: number): this {
    return this.setParam(this.shadows, colorSRGB, offset)
  }

  setMidtones(colorSRGB: ColorTuple, offset?: number): this {
    return this.setParam(this.midtones, colorSRGB, offset)
  }

  setHighlights(colorSRGB: ColorTuple, offset?: number): this {
    return this.setParam(this.highlights, colorSRGB, offset)
  }

  override setup(builder: NodeBuilder): unknown {
    const { colorLinear } = this
    invariant(colorLinear != null)

    return vec4(
      shadowsMidtonesHighlightsFn(
        colorLinear.rgb,
        this.shadows,
        this.midtones,
        this.highlights
      ),
      colorLinear.a
    )
  }
}

export const shadowsMidtonesHighlights = (
  ...args: ConstructorParameters<typeof ShadowsMidtonesHighlightsNode>
): ShadowsMidtonesHighlightsNode => new ShadowsMidtonesHighlightsNode(...args)
