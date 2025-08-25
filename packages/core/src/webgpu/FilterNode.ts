import {
  ClampToEdgeWrapping,
  HalfFloatType,
  LinearFilter,
  RenderTarget,
  RGBAFormat,
  Vector2
} from 'three'
import { uniform } from 'three/tsl'
import {
  NodeMaterial,
  NodeUpdateType,
  QuadMesh,
  RendererUtils,
  TempNode,
  type NodeBuilder,
  type NodeFrame,
  type TextureNode
} from 'three/webgpu'
import invariant from 'tiny-invariant'

import type { Node } from './node'
import { outputTexture } from './OutputTextureNode'

function createRenderTarget(name: string): RenderTarget {
  const renderTarget = new RenderTarget(1, 1, {
    depthBuffer: false,
    type: HalfFloatType,
    format: RGBAFormat
  })
  const texture = renderTarget.texture
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.generateMipmaps = false
  texture.name = name
  return renderTarget
}

export abstract class FilterNode extends TempNode {
  inputNode: TextureNode | null
  resolutionScale = 1

  private readonly renderTarget: RenderTarget
  private readonly material = new NodeMaterial()
  private readonly mesh = new QuadMesh(this.material)
  private rendererState!: RendererUtils.RendererState

  protected readonly texelSize = uniform(new Vector2())

  // WORKAROUND: The leading underscore avoids infinite recursion.
  // https://github.com/mrdoob/three.js/issues/31522
  private readonly _textureNode: TextureNode

  constructor(inputNode: TextureNode | null) {
    super('vec4')
    this.inputNode = inputNode

    const name = (this.constructor as typeof FilterNode).type
    this.renderTarget = createRenderTarget(name)

    this._textureNode = outputTexture(this, this.renderTarget.texture)

    this.updateBeforeType = NodeUpdateType.FRAME
  }

  getTextureNode(): TextureNode {
    return this._textureNode
  }

  setSize(width: number, height: number): this {
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
    this.rendererState = RendererUtils.resetRendererState(
      renderer,
      this.rendererState
    )

    const { inputNode } = this
    invariant(inputNode != null)

    const { width, height } = inputNode.value
    this.setSize(width, height)

    this.texelSize.value.set(1 / width, 1 / height)
    renderer.setRenderTarget(this.renderTarget)
    this.mesh.render(renderer)

    RendererUtils.restoreRendererState(renderer, this.rendererState)
  }

  protected abstract setupFilterNode(): Node

  override setup(builder: NodeBuilder): unknown {
    const { inputNode } = this
    invariant(inputNode != null)

    const { material } = this
    material.fragmentNode = this.setupFilterNode()
    material.needsUpdate = true

    this._textureNode.uvNode = inputNode.uvNode
    return this._textureNode
  }

  override dispose(): void {
    super.dispose()
    this.renderTarget.dispose()
    this.material.dispose()
  }
}
