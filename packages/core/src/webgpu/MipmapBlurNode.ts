import { add, uv, vec2, vec4 } from 'three/tsl'
import type {
  NodeBuilder,
  TextureNode,
  UniformNode,
  Vector2
} from 'three/webgpu'
import invariant from 'tiny-invariant'

import { DualMipmapFilterNode } from './DualMipmapFilterNode'
import type { Node } from './node'

export const mipmapBlurDownsample = (
  inputNode: TextureNode,
  texelSize: Node<'vec2'> | UniformNode<Vector2>
): Node<'vec4'> => {
  const center = uv()
  const offset1 = vec4(1, 1, -1, -1).mul(texelSize.xyxy).add(center.xyxy)
  const offset2 = vec4(2, 2, -2, -2).mul(texelSize.xyxy).add(center.xyxy)
  const uv01 = offset1.zy.toVertexStage() // -1, 1
  const uv02 = offset1.xy.toVertexStage() // 1, 1
  const uv03 = offset1.zw.toVertexStage() // -1, -1
  const uv04 = offset1.xw.toVertexStage() // 1, -1
  const uv05 = vec2(center.x, offset2.y).toVertexStage() // 0, 2
  const uv06 = vec2(offset2.z, center.y).toVertexStage() // -2, 0
  const uv07 = vec2(offset2.x, center.y).toVertexStage() // 2, 0
  const uv08 = vec2(center.x, offset2.w).toVertexStage() // 0, -2
  const uv09 = offset2.zy.toVertexStage() // -2, 2
  const uv10 = offset2.xy.toVertexStage() // 2, 2
  const uv11 = offset2.zw.toVertexStage() // -2, -2
  const uv12 = offset2.xw.toVertexStage() // 2, -2

  return add(
    add(
      inputNode.sample(center),
      inputNode.sample(uv01),
      inputNode.sample(uv02),
      inputNode.sample(uv03),
      inputNode.sample(uv04)
    ).mul(1 / 8),
    add(
      inputNode.sample(uv05),
      inputNode.sample(uv06),
      inputNode.sample(uv07),
      inputNode.sample(uv08)
    ).mul(1 / 16),
    add(
      inputNode.sample(uv09),
      inputNode.sample(uv10),
      inputNode.sample(uv11),
      inputNode.sample(uv12)
    ).mul(1 / 32)
  )
}

export const mipmapBlurUpsample = (
  inputNode: TextureNode,
  texelSize: Node<'vec2'> | UniformNode<Vector2>
): Node<'vec4'> => {
  const center = uv()
  const offset = vec4(1, 1, -1, -1).mul(texelSize.xyxy).add(center.xyxy)
  const uv1 = vec2(center.x, offset.y).toVertexStage() // 0, 1
  const uv2 = vec2(offset.z, center.y).toVertexStage() // -1, 0
  const uv3 = vec2(offset.x, center.y).toVertexStage() // 1, 0
  const uv4 = vec2(center.x, offset.w).toVertexStage() // 0, -1
  const uv5 = offset.zy.toVertexStage() // -1, 1
  const uv6 = offset.xy.toVertexStage() // 1, 1
  const uv7 = offset.zw.toVertexStage() // -1, -1
  const uv8 = offset.xw.toVertexStage() // 1, -1

  return add(
    inputNode.sample(center).mul(0.25),
    add(
      inputNode.sample(uv1),
      inputNode.sample(uv2),
      inputNode.sample(uv3),
      inputNode.sample(uv4)
    ).mul(0.125),
    add(
      inputNode.sample(uv5),
      inputNode.sample(uv6),
      inputNode.sample(uv7),
      inputNode.sample(uv8)
    ).mul(0.0625)
  )
}

// Implementation of Sledgehammer Games' temporary-stable bloom blur.
// See: https://www.iryoku.com/next-generation-post-processing-in-call-of-duty-advanced-warfare/
export class MipmapBlurNode extends DualMipmapFilterNode {
  static override get type(): string {
    return 'MipmapBlurNode'
  }

  constructor(inputNode?: TextureNode | null, levels = 4) {
    super(inputNode, levels)
    this.resolutionScale = 0.5
  }

  protected override setupDownsampleNode(builder: NodeBuilder): Node {
    invariant(this.inputNode != null)
    return mipmapBlurDownsample(this.inputNode, this.inputTexelSize)
  }

  protected override setupUpsampleNode(builder: NodeBuilder): Node {
    invariant(this.inputNode != null)
    return mipmapBlurUpsample(this.inputNode, this.inputTexelSize)
  }
}

export const mipmapBlur = (
  ...args: ConstructorParameters<typeof MipmapBlurNode>
): MipmapBlurNode => new MipmapBlurNode(...args)
