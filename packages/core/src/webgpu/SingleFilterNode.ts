import { Vector2, type RenderTarget } from 'three'
import { uniform } from 'three/tsl'
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

export abstract class SingleFilterNode extends FilterNode {
  private readonly renderTarget: RenderTarget
  private readonly material = new NodeMaterial()
  private readonly mesh = new QuadMesh(this.material)
  private rendererState?: RendererUtils.RendererState

  protected readonly inputTexelSize = uniform(new Vector2())

  constructor(inputNode?: TextureNode | null) {
    super(inputNode)

    this.renderTarget = this.createRenderTarget()
    this.outputTexture = this.renderTarget.texture
  }

  override setSize(width: number, height: number): this {
    const { resolutionScale } = this
    const w = Math.max(Math.round(width * resolutionScale), 1)
    const h = Math.max(Math.round(height * resolutionScale), 1)
    this.renderTarget.setSize(w, h)
    return this
  }

  override updateBefore({ renderer }: NodeFrame): void {
    if (renderer == null) {
      return
    }

    const { inputNode } = this
    invariant(inputNode != null)

    const { width, height } = inputNode.value
    this.setSize(width, height)
    this.inputTexelSize.value.set(1 / width, 1 / height)

    this.rendererState = resetRendererState(renderer, this.rendererState)

    renderer.setRenderTarget(this.renderTarget)
    this.mesh.render(renderer)

    restoreRendererState(renderer, this.rendererState)
  }

  protected abstract setupOutputNode(builder: NodeBuilder): Node

  override setup(builder: NodeBuilder): unknown {
    const { inputNode } = this
    invariant(inputNode != null)

    const { material } = this
    material.fragmentNode = this.setupOutputNode(builder)
    material.needsUpdate = true

    return super.setup(builder)
  }

  override dispose(): void {
    this.renderTarget.dispose()
    this.material.dispose()
    this.mesh.geometry.dispose()
    super.dispose()
  }
}
