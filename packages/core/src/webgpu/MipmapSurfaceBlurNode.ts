import { add, Fn, mix, uniform, uv, vec2, vec4 } from 'three/tsl'
import type { NodeBuilder, TextureNode } from 'three/webgpu'
import invariant from 'tiny-invariant'

import { DualMipmapFilterNode } from './DualMipmapFilterNode'
import type { Node } from './node'

const clampToBorder = (uv: Node<'vec2'>): Node<'float'> => {
  return uv.greaterThanEqual(0).all().and(uv.lessThanEqual(1).all()).toFloat()
}

// Implementation of Lena Piquet's bloom filter.
// Reference: https://www.froyok.fr/blog/2021-12-ue4-custom-bloom
export class MipmapSurfaceBlurNode extends DualMipmapFilterNode {
  static override get type(): string {
    return 'MipmapSurfaceBlurNode'
  }

  blendAmount = uniform(0.85)

  constructor(inputNode?: TextureNode | null, levels = 4) {
    super(inputNode, levels)
    this.resolutionScale = 0.5
  }

  protected override setupDownsampleNode(builder: NodeBuilder): Node {
    const { inputNode, inputTexelSize } = this
    invariant(inputNode != null)

    return Fn(() => {
      const center = uv()
      const offset1 = vec4(1, 1, -1, -1)
        .mul(inputTexelSize.xyxy)
        .add(center.xyxy)
      const offset2 = vec4(2, 2, -2, -2)
        .mul(inputTexelSize.xyxy)
        .add(center.xyxy)
      const uv01 = offset1.zy.toVertexStage() // -1, 1
      const uv02 = offset1.xy.toVertexStage() // 1, 1
      const uv03 = offset1.zw.toVertexStage() // -1, -1
      const uv04 = offset1.xw.toVertexStage() // 1, -1
      const uv05 = offset2.zy.toVertexStage() // -2, 2
      const uv06 = offset2.xy.toVertexStage() // 2, 2
      const uv07 = offset2.zw.toVertexStage() // -2, -2
      const uv08 = offset2.xw.toVertexStage() // 2, -2
      const uv09 = vec2(center.x, offset2.y).toVertexStage() // 0, 2
      const uv10 = vec2(offset2.z, center.y).toVertexStage() // -2, 0
      const uv11 = vec2(offset2.x, center.y).toVertexStage() // 2, 0
      const uv12 = vec2(center.x, offset2.w).toVertexStage() // 0, -2

      const innerWeight = 1 / 4 / 2
      const outerWeight = 1 / 9 / 2

      const output = inputNode.sample(center).mul(outerWeight)

      let weight: Node
      weight = vec4(
        clampToBorder(uv01),
        clampToBorder(uv02),
        clampToBorder(uv03),
        clampToBorder(uv04)
      ).mul(innerWeight)

      output.addAssign(
        inputNode.sample(uv01).mul(weight.x),
        inputNode.sample(uv02).mul(weight.y),
        inputNode.sample(uv03).mul(weight.z),
        inputNode.sample(uv04).mul(weight.w)
      )

      weight = vec4(
        clampToBorder(uv05),
        clampToBorder(uv06),
        clampToBorder(uv07),
        clampToBorder(uv08)
      ).mul(outerWeight)

      output.addAssign(
        inputNode.sample(uv05).mul(weight.x),
        inputNode.sample(uv06).mul(weight.y),
        inputNode.sample(uv07).mul(weight.z),
        inputNode.sample(uv08).mul(weight.w)
      )

      weight = vec4(
        clampToBorder(uv09),
        clampToBorder(uv10),
        clampToBorder(uv11),
        clampToBorder(uv12)
      ).mul(outerWeight)

      output.addAssign(
        inputNode.sample(uv09).mul(weight.x),
        inputNode.sample(uv10).mul(weight.y),
        inputNode.sample(uv11).mul(weight.z),
        inputNode.sample(uv12).mul(weight.w)
      )

      return output
    })()
  }

  protected override setupUpsampleNode(builder: NodeBuilder): Node {
    const { inputNode, inputTexelSize, downsampleNode } = this
    invariant(inputNode != null)

    const center = uv()
    const offset = vec4(1, 1, -1, -1).mul(inputTexelSize.xyxy).add(center.xyxy)
    const uv1 = vec2(center.x, offset.y).toVertexStage() // 0, 1
    const uv2 = vec2(offset.z, center.y).toVertexStage() // -1, 0
    const uv3 = vec2(offset.x, center.y).toVertexStage() // 1, 0
    const uv4 = vec2(center.x, offset.w).toVertexStage() // 0, -1
    const uv5 = offset.zy.toVertexStage() // -1, 1
    const uv6 = offset.xy.toVertexStage() // 1, 1
    const uv7 = offset.zw.toVertexStage() // -1, -1
    const uv8 = offset.xw.toVertexStage() // 1, -1

    const output = add(
      inputNode.sample(center).mul(1 / 4),
      add(
        inputNode.sample(uv1),
        inputNode.sample(uv2),
        inputNode.sample(uv3),
        inputNode.sample(uv4)
      ).mul(1 / 8),
      add(
        inputNode.sample(uv5),
        inputNode.sample(uv6),
        inputNode.sample(uv7),
        inputNode.sample(uv8)
      ).mul(1 / 16)
    )
    return mix(downsampleNode.sample(center), output, this.blendAmount)
  }
}

export const mipmapSurfaceBlur = (
  ...args: ConstructorParameters<typeof MipmapSurfaceBlurNode>
): MipmapSurfaceBlurNode => new MipmapSurfaceBlurNode(...args)
