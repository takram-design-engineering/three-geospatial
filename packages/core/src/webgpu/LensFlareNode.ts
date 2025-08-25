import { add, convertToTexture, nodeObject, uniform } from 'three/tsl'
import {
  TempNode,
  type Node,
  type NodeBuilder,
  type TextureNode
} from 'three/webgpu'
import invariant from 'tiny-invariant'

import { DownsampleThresholdNode } from './DownsampleThresholdNode'
import { GaussianBlurNode } from './GaussianBlurNode'
import { LensFlareFeaturesNode } from './LensFlareFeaturesNode'
import { MipmapSurfaceBlurNode } from './MipmapSurfaceBlurNode'
import type { NodeObject } from './node'

export class LensFlareNode extends TempNode {
  inputNode: TextureNode | null
  thresholdNode: DownsampleThresholdNode
  blurNode: GaussianBlurNode
  featuresNode: LensFlareFeaturesNode
  bloomNode: MipmapSurfaceBlurNode

  bloomAmount = uniform(0.05)

  constructor(inputNode: TextureNode | null) {
    super('vec4')
    this.inputNode = inputNode

    this.thresholdNode = new DownsampleThresholdNode(null)
    this.blurNode = new GaussianBlurNode(null)
    this.featuresNode = new LensFlareFeaturesNode(null)
    this.bloomNode = new MipmapSurfaceBlurNode(null, 8)

    // Use the full resolution because the thresholdNode already downsamples the
    // input texture.
    this.blurNode.resolutionScale = 1
    this.featuresNode.resolutionScale = 1
    this.bloomNode.resolutionScale = 1
  }

  override setup(builder: NodeBuilder): unknown {
    const { inputNode, thresholdNode, blurNode, featuresNode, bloomNode } = this
    invariant(inputNode != null)

    const threshold = thresholdNode.getTextureNode()
    const blur = blurNode.getTextureNode()

    // input → threshold → blur → features
    thresholdNode.inputNode = inputNode
    blurNode.inputNode = threshold
    featuresNode.inputNode = blur

    // input → threshold → bloom
    bloomNode.inputNode = threshold

    const bloom = nodeObject(bloomNode.getTextureNode())
    const features = nodeObject(featuresNode.getTextureNode())

    return add(inputNode, bloom.mul(this.bloomAmount)).add(features)
  }

  override dispose(): void {
    super.dispose()
    this.thresholdNode.dispose()
    this.blurNode.dispose()
    this.featuresNode.dispose()
    this.bloomNode.dispose()
  }
}

export const lensFlare = (inputNode: Node | null): NodeObject<LensFlareNode> =>
  nodeObject(
    new LensFlareNode(inputNode != null ? convertToTexture(inputNode) : null)
  )
