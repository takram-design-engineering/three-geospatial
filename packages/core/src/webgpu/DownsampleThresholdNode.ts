import { luminance, nodeObject, smoothstep, uniform, vec4 } from 'three/tsl'
import type { TextureNode } from 'three/webgpu'
import invariant from 'tiny-invariant'

import { FilterNode } from './FilterNode'
import { downsample } from './MipmapBlurNode'
import type { Node, NodeObject } from './node'

export class DownsampleThresholdNode extends FilterNode {
  static override get type(): string {
    return 'DownsampleThresholdNode'
  }

  thresholdLevel = uniform(5)
  thresholdRange = uniform(1)

  constructor(inputNode: TextureNode | null) {
    super(inputNode)
    this.resolutionScale = 0.5
  }

  protected override setupFilterNode(): Node {
    const { inputNode, thresholdLevel, thresholdRange, texelSize } = this
    invariant(inputNode != null)

    const result = downsample(inputNode, texelSize)
    const scale = smoothstep(
      thresholdLevel,
      thresholdLevel.add(thresholdRange),
      luminance(result)
    )
    return vec4(result.rgb.mul(scale), result.a)
  }
}

export const downsampleThreshold = (
  ...args: ConstructorParameters<typeof DownsampleThresholdNode>
): NodeObject<DownsampleThresholdNode> =>
  nodeObject(new DownsampleThresholdNode(...args))
