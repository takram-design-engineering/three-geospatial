import { max, nodeObject, texture, uniform } from 'three/tsl'
import {
  HalfFloatType,
  LinearFilter,
  NodeMaterial,
  NodeUpdateType,
  QuadMesh,
  RendererUtils,
  RenderTarget,
  RGBAFormat,
  TempNode,
  Vector2,
  type NodeBuilder,
  type NodeFrame,
  type Renderer,
  type TextureNode
} from 'three/webgpu'

import type { Node, NodeObject } from './node'
import { outputTexture } from './OutputTextureNode'
import { convertToTexture } from './RenderTargetNode'

const { resetRendererState, restoreRendererState } = RendererUtils

function createRenderTarget(name: string): RenderTarget {
  const renderTarget = new RenderTarget(1, 1, {
    depthBuffer: false,
    type: HalfFloatType,
    format: RGBAFormat
  })
  const texture = renderTarget.texture
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.generateMipmaps = false
  texture.name = `AfterImageNode.${name}`
  return renderTarget
}

const sizeScratch = /*#__PURE__*/ new Vector2()

export class AfterImageNode extends TempNode {
  static override get type(): string {
    return 'AfterImageNode'
  }

  inputNode: TextureNode

  alpha = uniform(0.99)

  // WORKAROUND: The leading underscore avoids infinite recursion.
  // https://github.com/mrdoob/three.js/issues/31522
  private readonly _textureNode: TextureNode

  private currentRT = createRenderTarget('Current')
  private historyRT = createRenderTarget('History')
  private readonly resolveMaterial = new NodeMaterial()
  private readonly copyMaterial = new NodeMaterial()
  private readonly mesh = new QuadMesh()
  private rendererState!: RendererUtils.RendererState
  private needsClearHistory = false

  private readonly currentNode = texture(this.currentRT.texture)
  private readonly previousNode = texture(this.historyRT.texture)

  constructor(inputNode: TextureNode) {
    super('vec4')
    this.inputNode = inputNode

    this._textureNode = outputTexture(this, this.currentRT.texture)

    this.updateBeforeType = NodeUpdateType.FRAME
  }

  getTextureNode(): TextureNode {
    return this._textureNode
  }

  setSize(width: number, height: number): this {
    const { currentRT, historyRT } = this
    if (width !== historyRT.width || height !== historyRT.height) {
      currentRT.setSize(width, height)
      historyRT.setSize(width, height)
      this.needsClearHistory = true
    }
    return this
  }

  private clearHistory(renderer: Renderer): void {
    // Bind and clear the history render target to make sure it's initialized
    // after the resize which triggers a dispose().
    renderer.setRenderTarget(this.currentRT)
    void renderer.clear()
    renderer.setRenderTarget(this.historyRT)
    void renderer.clear()

    this.needsClearHistory = false
  }

  private swapBuffers(): void {
    // Swap the render target textures instead of copying:
    const { currentRT, historyRT } = this
    this.currentRT = historyRT
    this.historyRT = currentRT
    this.currentNode.value = historyRT.texture
    this.previousNode.value = currentRT.texture

    // The output node must point to the current texture.
    this._textureNode.value = currentRT.texture
  }

  override updateBefore({ renderer }: NodeFrame): void {
    if (renderer == null) {
      return
    }

    const size = renderer.getDrawingBufferSize(sizeScratch)
    this.setSize(size.x, size.y)

    this.rendererState = resetRendererState(renderer, this.rendererState)

    if (this.needsClearHistory) {
      this.clearHistory(renderer)
    }

    renderer.setRenderTarget(this.currentRT)
    this.mesh.material = this.resolveMaterial
    this.mesh.render(renderer)

    restoreRendererState(renderer, this.rendererState)

    this.swapBuffers()
  }

  override setup(builder: NodeBuilder): unknown {
    const { resolveMaterial, copyMaterial } = this

    resolveMaterial.fragmentNode = max(
      this.inputNode,
      this.previousNode.mul(this.alpha)
    )
    resolveMaterial.needsUpdate = true

    copyMaterial.fragmentNode = this.inputNode
    copyMaterial.needsUpdate = true

    this._textureNode.uvNode = this.inputNode.uvNode
    return this._textureNode
  }

  override dispose(): void {
    this.currentRT.dispose()
    this.historyRT.dispose()
    this.resolveMaterial.dispose()
    this.copyMaterial.dispose()
    super.dispose()
  }
}

export const afterImage = (inputNode: Node): NodeObject<AfterImageNode> =>
  nodeObject(new AfterImageNode(convertToTexture(inputNode)))
