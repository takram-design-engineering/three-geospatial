import { add, uv, vec2, vec4 } from 'three/tsl'
import type { Node, NodeBuilder, TextureNode } from 'three/webgpu'
import invariant from 'tiny-invariant'

import { DualMipmapFilterNode } from './DualMipmapFilterNode'

export class KawaseBlurNode extends DualMipmapFilterNode {
  static override get type(): string {
    return 'KawaseBlurNode'
  }

  constructor(inputNode?: TextureNode | null, levels = 4) {
    super(inputNode, levels)
    this.resolutionScale = 0.5
  }

  protected override setupDownsampleNode(builder: NodeBuilder): Node {
    const { inputNode, inputTexelSize } = this
    invariant(inputNode != null)

    const center = uv()
    const offset = vec4(1, 1, -1, -1)
      .mul(inputTexelSize.xyxy.mul(0.5))
      .add(center.xyxy)
      .toVertexStage()
    const uv1 = offset.zy // -0.5, 0.5
    const uv2 = offset.xy // 0.5, 0.5
    const uv3 = offset.xw // 0.5, -0.5
    const uv4 = offset.zw // -0.5, -0.5

    return add(
      inputNode.sample(center).mul(4),
      inputNode.sample(uv1),
      inputNode.sample(uv2),
      inputNode.sample(uv3),
      inputNode.sample(uv4)
    ).mul(1 / 8)
  }

  protected override setupUpsampleNode(builder: NodeBuilder): Node {
    const { inputNode, inputTexelSize } = this
    invariant(inputNode != null)

    const center = uv()
    const offset = vec4(1, 1, -1, -1)
      .mul(inputTexelSize.xyxy.mul(0.5))
      .add(center.xyxy)
      .toVertexStage()
    const uv1 = offset.zy // -0.5, 0.5
    const uv2 = offset.xy // 0.5, 0.5
    const uv3 = offset.xw // 0.5, -0.5
    const uv4 = offset.zw // -0.5, -0.5
    const uv5 = vec2(offset.z, center.y) // -0.5, 0
    const uv6 = vec2(offset.x, center.y) // 0.5, 0
    const uv7 = vec2(center.x, offset.y) // 0, 0.5
    const uv8 = vec2(center.x, offset.w) // 0, -0.5

    return add(
      add(
        inputNode.sample(uv1),
        inputNode.sample(uv2),
        inputNode.sample(uv3),
        inputNode.sample(uv4)
      ).mul(1 / 12),
      add(
        inputNode.sample(uv5),
        inputNode.sample(uv6),
        inputNode.sample(uv7),
        inputNode.sample(uv8)
      ).mul(1 / 6)
    )
  }
}

export const kawaseBlur = (
  ...args: ConstructorParameters<typeof KawaseBlurNode>
): KawaseBlurNode => new KawaseBlurNode(...args)
