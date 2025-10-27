import { add, nodeObject, uv, vec2, vec4 } from 'three/tsl'
import type { NodeBuilder, TextureNode } from 'three/webgpu'
import invariant from 'tiny-invariant'

import { DualMipmapFilterNode } from './DualMipmapFilterNode'
import type { Node, NodeObject } from './node'

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
    const uv1 = offset.zy.toVertexStage() // -0.5, 0.5
    const uv2 = offset.xy.toVertexStage() // 0.5, 0.5
    const uv3 = offset.xw.toVertexStage() // 0.5, -0.5
    const uv4 = offset.zw.toVertexStage() // -0.5, -0.5

    return add(
      inputNode.sample(center).mul(4),
      inputNode.sample(uv1),
      inputNode.sample(uv2),
      inputNode.sample(uv3),
      inputNode.sample(uv4)
    ).div(8)
  }

  protected override setupUpsampleNode(builder: NodeBuilder): Node {
    const { inputNode, inputTexelSize } = this
    invariant(inputNode != null)

    const center = uv()
    const offset = vec4(1, 1, -1, -1)
      .mul(inputTexelSize.xyxy.mul(0.5))
      .add(center.xyxy)
    const uv1 = offset.zy.toVertexStage() // -0.5, 0.5
    const uv2 = offset.xy.toVertexStage() // 0.5, 0.5
    const uv3 = offset.xw.toVertexStage() // 0.5, -0.5
    const uv4 = offset.zw.toVertexStage() // -0.5, -0.5
    const uv5 = vec2(offset.z, center.y).toVertexStage() // -0.5, 0
    const uv6 = vec2(offset.x, center.y).toVertexStage() // 0.5, 0
    const uv7 = vec2(center.x, offset.y).toVertexStage() // 0, 0.5
    const uv8 = vec2(center.x, offset.w).toVertexStage() // 0, -0.5

    return add(
      add(
        inputNode.sample(uv1),
        inputNode.sample(uv2),
        inputNode.sample(uv3),
        inputNode.sample(uv4)
      ).div(12),
      add(
        inputNode.sample(uv5),
        inputNode.sample(uv6),
        inputNode.sample(uv7),
        inputNode.sample(uv8)
      ).div(6)
    )
  }
}

export const kawaseBlur = (
  ...args: ConstructorParameters<typeof KawaseBlurNode>
): NodeObject<KawaseBlurNode> => nodeObject(new KawaseBlurNode(...args))
