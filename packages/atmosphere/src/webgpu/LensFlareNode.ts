import { add, nodeObject } from 'three/tsl'
import { TempNode, type NodeBuilder, type TextureNode } from 'three/webgpu'
import invariant from 'tiny-invariant'

import {
  GaussianBlurNode,
  MipmapBlurNode,
  nodeType,
  referenceTo,
  type NodeObject
} from '@takram/three-geospatial/webgpu'

import { DownsampleThresholdNode } from './DownsampleThresholdNode'
import { LensFlareFeaturesNode } from './LensFlareFeaturesNode'

export class LensFlareNode extends TempNode {
  inputNode: TextureNode | null
  @nodeType('float') intensity: number

  thresholdNode: DownsampleThresholdNode
  blurNode: GaussianBlurNode
  featuresNode: LensFlareFeaturesNode
  bloomNode: MipmapBlurNode

  constructor(inputNode: TextureNode | null, intensity = 0.005) {
    super('vec4')
    this.inputNode = inputNode
    this.intensity = intensity

    this.thresholdNode = new DownsampleThresholdNode(null)
    this.blurNode = new GaussianBlurNode(null)
    this.featuresNode = new LensFlareFeaturesNode(null)
    this.bloomNode = new MipmapBlurNode(null)
  }

  override setup(builder: NodeBuilder): unknown {
    const { inputNode, thresholdNode, blurNode, featuresNode, bloomNode } = this
    invariant(inputNode != null)

    // input → threshold → blur → features
    thresholdNode.inputNode = inputNode
    blurNode.inputNode = thresholdNode.getTextureNode()
    featuresNode.inputNode = blurNode.getTextureNode()

    // input → bloom
    bloomNode.inputNode = inputNode

    const reference = referenceTo<LensFlareNode>(this)
    const intensity = reference('intensity')
    const bloom = bloomNode.getTextureNode()
    const features = featuresNode.getTextureNode()
    bloom.uvNode = inputNode.uvNode
    features.uvNode = inputNode.uvNode

    return nodeObject(inputNode).add(add(bloom, features).mul(intensity))
  }

  override dispose(): void {
    super.dispose()
    this.thresholdNode.dispose()
    this.blurNode.dispose()
    this.featuresNode.dispose()
    this.bloomNode.dispose()
  }
}

export const lensFlare = (
  ...args: ConstructorParameters<typeof LensFlareNode>
): NodeObject<LensFlareNode> => nodeObject(new LensFlareNode(...args))
