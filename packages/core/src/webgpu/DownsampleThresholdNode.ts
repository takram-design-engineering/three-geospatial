import { luminance, smoothstep, uniform, vec4 } from 'three/tsl'
import type { TextureNode } from 'three/webgpu'
import invariant from 'tiny-invariant'

import { mipmapBlurDownsample } from './MipmapBlurNode'
import type { Node } from './node'
import { SingleFilterNode } from './SingleFilterNode'

export class DownsampleThresholdNode extends SingleFilterNode {
  static override get type(): string {
    return 'DownsampleThresholdNode'
  }

  thresholdLevel = uniform(5)
  thresholdRange = uniform(1)

  constructor(inputNode?: TextureNode | null) {
    super(inputNode)
    this.resolutionScale = 0.5
  }

  protected override setupOutputNode(): Node {
    const { inputNode, thresholdLevel, thresholdRange, inputTexelSize } = this
    invariant(inputNode != null)

    const outputColor = mipmapBlurDownsample(inputNode, inputTexelSize)
    const outputLuminance = luminance(outputColor.rgb)
    const scale = smoothstep(
      thresholdLevel,
      thresholdLevel.add(thresholdRange),
      outputLuminance
    )
    return vec4(outputColor.rgb, outputLuminance).mul(scale)
  }
}

export const downsampleThreshold = (
  ...args: ConstructorParameters<typeof DownsampleThresholdNode>
): DownsampleThresholdNode => new DownsampleThresholdNode(...args)
