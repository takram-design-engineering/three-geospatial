import { add, convertToTexture, nodeObject, uniform } from 'three/tsl'
import {
  TempNode,
  type Node,
  type NodeBuilder,
  type TextureNode
} from 'three/webgpu'
import invariant from 'tiny-invariant'

import {
  GaussianBlurNode,
  MipmapBlurNode,
  type NodeObject
} from '@takram/three-geospatial/webgpu'

import { DownsampleThresholdNode } from './DownsampleThresholdNode'
import { LensFlareFeaturesNode } from './LensFlareFeaturesNode'

export class LensFlareNode extends TempNode {
  inputNode: TextureNode | null
  intensity = uniform(0.005)

  thresholdNode: DownsampleThresholdNode
  blurNode: GaussianBlurNode
  featuresNode: LensFlareFeaturesNode
  bloomNode: MipmapBlurNode

  constructor(inputNode: TextureNode | null) {
    super('vec4')
    this.inputNode = inputNode

    this.thresholdNode = new DownsampleThresholdNode(null)
    this.blurNode = new GaussianBlurNode(null)
    this.featuresNode = new LensFlareFeaturesNode(null)
    this.bloomNode = new MipmapBlurNode(null)
  }

  override setup(builder: NodeBuilder): unknown {
    const {
      inputNode,
      intensity,
      thresholdNode,
      blurNode,
      featuresNode,
      bloomNode
    } = this
    invariant(inputNode != null)

    // input → threshold → blur → features
    thresholdNode.inputNode = inputNode
    blurNode.inputNode = thresholdNode.getTextureNode()
    featuresNode.inputNode = blurNode.getTextureNode()

    // input → threshold → bloom
    bloomNode.inputNode = thresholdNode.getTextureNode()

    const bloom = bloomNode.getTextureNode()
    const features = featuresNode.getTextureNode()
    bloom.uvNode = inputNode.uvNode
    features.uvNode = inputNode.uvNode

    return add(bloom, features).mul(intensity)
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
