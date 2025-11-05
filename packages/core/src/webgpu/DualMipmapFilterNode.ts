import { Vector2, type RenderTarget } from 'three'
import { texture, uniform } from 'three/tsl'
import {
  NodeMaterial,
  QuadMesh,
  RendererUtils,
  type NodeBuilder,
  type NodeFrame,
  type TextureNode
} from 'three/webgpu'
import invariant from 'tiny-invariant'

import { FilterNode } from './FilterNode'
import type { Node } from './node'

const { resetRendererState, restoreRendererState } = RendererUtils

export abstract class DualMipmapFilterNode extends FilterNode {
  private readonly downsampleRTs: RenderTarget[] = []
  private readonly upsampleRTs: RenderTarget[] = []
  private readonly downsampleMaterial = new NodeMaterial()
  private readonly upsampleMaterial = new NodeMaterial()
  private readonly mesh = new QuadMesh()
  private rendererState?: RendererUtils.RendererState

  protected readonly inputTexelSize = uniform(new Vector2())
  protected readonly downsampleNode = texture()

  constructor(inputNode: TextureNode | null | undefined, levels: number) {
    super(inputNode)

    for (let i = 0; i < levels; ++i) {
      this.downsampleRTs[i] = this.createRenderTarget(`Downsample${i}`)
      if (i < levels - 1) {
        this.upsampleRTs[i] = this.createRenderTarget(`Upsample${i}`)
      }
    }
    this.outputTexture = this.upsampleRTs[0].texture
  }

  setSize(width: number, height: number): this {
    const { resolutionScale } = this
    let w = Math.max(Math.round(width * resolutionScale), 1)
    let h = Math.max(Math.round(height * resolutionScale), 1)

    const { downsampleRTs, upsampleRTs } = this
    for (let i = 0; i < downsampleRTs.length; ++i) {
      w = Math.max(Math.round(w / 2), 1)
      h = Math.max(Math.round(h / 2), 1)
      downsampleRTs[i].setSize(w, h)
      if (i < upsampleRTs.length) {
        upsampleRTs[i].setSize(w, h)
      }
    }
    return this
  }

  override updateBefore({ renderer }: NodeFrame): void {
    if (renderer == null) {
      return
    }
    const {
      downsampleRTs,
      upsampleRTs,
      mesh,
      inputNode,
      inputTexelSize,
      downsampleNode
    } = this
    invariant(inputNode != null)

    const { width, height } = inputNode.value
    this.setSize(width, height)

    const originalTexture = inputNode.value
    this.rendererState = resetRendererState(renderer, this.rendererState)

    mesh.material = this.downsampleMaterial
    for (const renderTarget of downsampleRTs) {
      const { width, height } = inputNode.value
      inputTexelSize.value.set(1 / width, 1 / height)
      renderer.setRenderTarget(renderTarget)
      mesh.render(renderer)
      inputNode.value = renderTarget.texture
    }

    mesh.material = this.upsampleMaterial
    for (let i = upsampleRTs.length - 1; i >= 0; --i) {
      const renderTarget = upsampleRTs[i]
      const { width, height } = inputNode.value
      inputTexelSize.value.set(1 / width, 1 / height)
      downsampleNode.value = downsampleRTs[i].texture
      renderer.setRenderTarget(renderTarget)
      mesh.render(renderer)
      inputNode.value = renderTarget.texture
    }

    restoreRendererState(renderer, this.rendererState)
    inputNode.value = originalTexture
  }

  protected abstract setupDownsampleNode(builder: NodeBuilder): Node
  protected abstract setupUpsampleNode(builder: NodeBuilder): Node

  override setup(builder: NodeBuilder): unknown {
    const { inputNode } = this
    invariant(inputNode != null)

    const { downsampleMaterial, upsampleMaterial } = this
    downsampleMaterial.fragmentNode = this.setupDownsampleNode(builder)
    upsampleMaterial.fragmentNode = this.setupUpsampleNode(builder)
    downsampleMaterial.needsUpdate = true
    upsampleMaterial.needsUpdate = true

    return super.setup(builder)
  }

  override dispose(): void {
    for (const downsampleRT of this.downsampleRTs) {
      downsampleRT.dispose()
    }
    for (const upsampleRT of this.upsampleRTs) {
      upsampleRT.dispose()
    }
    this.downsampleMaterial.dispose()
    this.upsampleMaterial.dispose()
    this.mesh.geometry.dispose()
    super.dispose()
  }
}
