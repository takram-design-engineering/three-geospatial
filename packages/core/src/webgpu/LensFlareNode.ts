import {
  add,
  Fn,
  luminance,
  mix,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
  viewportSize
} from 'three/tsl'
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
      name: 'LensFlare [Features]',
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

  getDebugInternalTexturesNode(uvNode: Node<'vec2'> = uv()): Node<'vec3'> {
    const threshold = this.thresholdNode.getTextureNode()
    const blur = this.blurNode.getTextureNode()
    const bloom = this.bloomNode.getTextureNode()
    const features = this.featuresNode.getTextureNode()
    const glare = this.glareNode.getTextureNode()

    const uv = vec4(uvNode, uvNode.sub(0.5)).mul(2).toConst()
    const quadTexture = texture(this.glareNode.quadTexture)
    const quadSize = vec2(quadTexture.size().mul(4)).div(viewportSize)
    return uvNode.y
      .lessThan(0.5)
      .select(
        uvNode.x
          .lessThan(0.5)
          .select(
            mix(
              blur.sample(uv.xy).rgb,
              vec3(1, 0, 0),
              luminance(threshold.sample(uv.xy).rgb).saturate()
            ),
            bloom.sample(uv.zy).rgb
          )
          .uniformFlow(),
        uvNode.x
          .lessThan(0.5)
          .select(
            features.sample(uv.xw).rgb,
            glare
              .sample(uv.zw)
              .rgb.add(
                quadTexture
                  .sample(uv.zw.div(quadSize))
                  .rgb.mul(uv.zw.lessThan(quadSize).all())
              )
          )
          .uniformFlow()
      )
      .uniformFlow().rgb
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
  new LensFlareNode(convertToTexture(inputNode, { name: 'LensFlare [Input]' }))
