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

export abstract class SeparableFilterNode extends FilterNode {
  iterations = 1

  private readonly horizontalRT: RenderTarget
  private readonly verticalRT: RenderTarget
  private readonly material = new NodeMaterial()
  private readonly mesh = new QuadMesh(this.material)
  private rendererState?: RendererUtils.RendererState

  protected readonly inputTexelSize = uniform(new Vector2())
  protected readonly direction = uniform(new Vector2())

  constructor(inputNode?: TextureNode | null) {
    super(inputNode)

    this.horizontalRT = this.createRenderTarget('Horizontal')
    this.verticalRT = this.createRenderTarget('Vertical')
    this.outputTexture = this.verticalRT.texture
  }

  setSize(width: number, height: number): this {
    const { resolutionScale } = this
    const w = Math.max(Math.round(width * resolutionScale), 1)
    const h = Math.max(Math.round(height * resolutionScale), 1)
    this.horizontalRT.setSize(w, h)
    this.verticalRT.setSize(w, h)
    return this
  }

  override updateBefore({ renderer }: NodeFrame): void {
    if (renderer == null) {
      return
    }

    const { horizontalRT, verticalRT, mesh, inputNode, direction } = this
    invariant(inputNode != null)

    const { width, height } = inputNode.value
    this.setSize(width, height)
    this.inputTexelSize.value.set(1 / width, 1 / height)

    const originalTexture = inputNode.value
    this.rendererState = resetRendererState(renderer, this.rendererState)

    for (let i = 0; i < this.iterations; ++i) {
      direction.value.set(1, 0)
      renderer.setRenderTarget(horizontalRT)
      mesh.render(renderer)
      inputNode.value = horizontalRT.texture

      direction.value.set(0, 1)
      renderer.setRenderTarget(verticalRT)
      mesh.render(renderer)
      inputNode.value = verticalRT.texture
    }

    restoreRendererState(renderer, this.rendererState)
    inputNode.value = originalTexture
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
    this.horizontalRT.dispose()
    this.verticalRT.dispose()
    this.material.dispose()
    this.mesh.geometry.dispose()
    super.dispose()
  }
}
