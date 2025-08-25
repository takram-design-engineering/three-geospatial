import { convertToTexture, Fn, nodeObject, select, uniform } from 'three/tsl'
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
import { LensGlareNode } from './LensGlareNode'
import { MipmapSurfaceBlurNode } from './MipmapSurfaceBlurNode'
import type { NodeObject } from './node'

export class LensFlareNode extends TempNode {
  inputNode: TextureNode | null
  thresholdNode: DownsampleThresholdNode
  blurNode: GaussianBlurNode
  featuresNode: LensFlareFeaturesNode
  bloomNode: MipmapSurfaceBlurNode
  glareNode: LensGlareNode

  bloomIntensity = uniform(0.05)

  constructor(inputNode: TextureNode | null) {
    super('vec4')
    this.inputNode = inputNode

    this.thresholdNode = new DownsampleThresholdNode(null)
    this.blurNode = new GaussianBlurNode(null)
    this.featuresNode = new LensFlareFeaturesNode(null)
    this.bloomNode = new MipmapSurfaceBlurNode(null, 8)
    this.glareNode = new LensGlareNode(null)

    // Use the full resolution because the thresholdNode already downsamples the
    // input texture.
    this.blurNode.resolutionScale = 1
    this.featuresNode.resolutionScale = 1
    this.bloomNode.resolutionScale = 1
    this.glareNode.resolutionScale = 1
  }

  override setup(builder: NodeBuilder): unknown {
    const {
      inputNode,
      thresholdNode,
      blurNode,
      featuresNode,
      bloomNode,
      glareNode
    } = this
    invariant(inputNode != null)

    const threshold = thresholdNode.getTextureNode()
    const blur = blurNode.getTextureNode()

    // input → threshold → blur → features
    thresholdNode.inputNode = inputNode
    blurNode.inputNode = threshold
    featuresNode.inputNode = blur

    // input → threshold → bloom
    bloomNode.inputNode = threshold

    // input → threshold → glare
    // TODO: Turn off glareNode on WebGLBackend:
    glareNode.inputNode = threshold

    const bloom = nodeObject(bloomNode.getTextureNode()).mul(
      this.bloomIntensity
    )
    const features = featuresNode.getTextureNode()
    const glare = glareNode.getTextureNode()

    // TODO: Add an option to switch to mixing the bloom:
    return Fn(() => {
      const output = nodeObject(inputNode)

      // Prevent the output from becoming too bright.
      const plusBloom = output.add(bloom).toConst()
      output.assign(select(output.lessThan(plusBloom), plusBloom, output))
      const plusGlare = output.add(glare).toConst()
      output.assign(select(output.lessThan(plusGlare), plusGlare, output))

      return output.add(features)
    })()
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
