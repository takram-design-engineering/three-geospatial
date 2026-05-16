import { add, Fn, uniform } from 'three/tsl'
import { TempNode, type NodeBuilder, type TextureNode } from 'three/webgpu'
import invariant from 'tiny-invariant'

import { DownsampleThresholdNode } from './DownsampleThresholdNode'
import { GaussianBlurNode } from './GaussianBlurNode'
import { LensGhostNode } from './LensGhostNode'
import { LensGlareNode } from './LensGlareNode'
import { LensHaloNode } from './LensHaloNode'
import { MipmapSurfaceBlurNode } from './MipmapSurfaceBlurNode'
import type { Node } from './node'
import {
  convertToTexture,
  renderTarget,
  type RenderTargetNode
} from './RenderTargetNode'
import { isWebGPU } from './utils'

export class LensFlareNode extends TempNode {
  static override get type(): string {
    return 'LensFlareNode'
  }

  inputNode: TextureNode | null
  thresholdNode: DownsampleThresholdNode
  blurNode: GaussianBlurNode
  ghostNode: LensGhostNode
  haloNode: LensHaloNode
  bloomNode: MipmapSurfaceBlurNode
  glareNode: LensGlareNode

  bloomIntensity = uniform(0.05)

  featuresNode: RenderTargetNode

  constructor(inputNode: TextureNode | null = null) {
    super('vec4')
    this.inputNode = inputNode

    this.thresholdNode = new DownsampleThresholdNode()
    this.blurNode = new GaussianBlurNode()
    this.ghostNode = new LensGhostNode()
    this.haloNode = new LensHaloNode()
    this.bloomNode = new MipmapSurfaceBlurNode(null, 8)
    this.glareNode = new LensGlareNode()

    this.featuresNode = renderTarget(add(this.ghostNode, this.haloNode), {
      name: 'LensFlare_features',
      resolutionScale: 0.5
    })

    this.thresholdNode.resolutionScale = 0.5
    this.blurNode.resolutionScale = 0.5 // Relative to thresholdNode: 0.25
    this.glareNode.resolutionScale = 1 // Relative to thresholdNode: 0.5
  }

  override setup(builder: NodeBuilder): unknown {
    const {
      inputNode,
      thresholdNode,
      blurNode,
      ghostNode,
      haloNode,
      bloomNode,
      featuresNode,
      glareNode
    } = this
    invariant(inputNode != null)

    const threshold = thresholdNode.getTextureNode()
    const blur = blurNode.getTextureNode()
    const features = featuresNode.getTextureNode()

    // input → threshold → blur → ghost
    // input → threshold → blur → halo
    thresholdNode.inputNode = inputNode
    blurNode.inputNode = threshold
    ghostNode.inputNode = blur
    haloNode.inputNode = blur

    // input → bloom
    bloomNode.inputNode = inputNode

    // input → threshold → glare
    glareNode.inputNode = threshold

    const bloom = bloomNode.getTextureNode().mul(this.bloomIntensity)
    const glare = glareNode.getTextureNode()

    return Fn(() => {
      // TODO: Prevent the output from becoming too bright.
      const output = inputNode
      output.addAssign(bloom)
      if (isWebGPU(builder)) {
        output.addAssign(glare)
      }
      return output.add(features)
    })()
  }

  override dispose(): void {
    this.thresholdNode.dispose()
    this.blurNode.dispose()
    this.ghostNode.dispose()
    this.haloNode.dispose()
    this.bloomNode.dispose()
    this.glareNode.dispose()
    this.featuresNode.dispose()
    super.dispose()
  }
}

export const lensFlare = (inputNode?: Node | null): LensFlareNode =>
  new LensFlareNode(convertToTexture(inputNode, { name: 'LensFlare_input' }))
