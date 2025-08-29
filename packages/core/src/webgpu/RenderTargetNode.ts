import { uv } from 'three/tsl'
import {
  ClampToEdgeWrapping,
  HalfFloatType,
  LinearFilter,
  NodeMaterial,
  NodeUpdateType,
  QuadMesh,
  RendererUtils,
  RenderTarget,
  RGBAFormat,
  TextureNode,
  Vector2,
  type Node,
  type NodeBuilder,
  type NodeFrame
} from 'three/webgpu'

const { resetRendererState, restoreRendererState } = RendererUtils

function createRenderTarget(): RenderTarget {
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
  texture.name = 'RenderTargetNode'
  return renderTarget
}

const sizeScratch = /*#__PURE__*/ new Vector2()

// Similar to RTTNode, which is a bit finicky to handle.
export class RenderTargetNode extends TextureNode {
  static override get type(): string {
    return 'RenderTargetNode'
  }

  node: Node
  resolutionScale = 1

  private readonly renderTarget: RenderTarget
  private readonly material = new NodeMaterial()
  private readonly mesh = new QuadMesh(this.material)
  private rendererState!: RendererUtils.RendererState

  constructor(node: Node) {
    const renderTarget = createRenderTarget()
    super(renderTarget.texture, uv())
    this.node = node
    this.renderTarget = renderTarget
    this.updateBeforeType = NodeUpdateType.FRAME
    this.setUpdateMatrix(false)
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

    const size = renderer.getDrawingBufferSize(sizeScratch)
    this.setSize(size.x, size.y)

    this.rendererState = resetRendererState(renderer, this.rendererState)

    renderer.setRenderTarget(this.renderTarget)
    this.mesh.render(renderer)

    restoreRendererState(renderer, this.rendererState)
  }

  override setup(builder: NodeBuilder): unknown {
    const { material } = this
    material.fragmentNode = this.node
    material.needsUpdate = true
    return super.setup(builder)
  }

  override dispose(): void {
    this.material.dispose()
    super.dispose()
  }
}

export const convertToTexture = (
  node: Node & {
    isTextureNode?: boolean
    isSampleNode?: boolean
    getTextureNode?: () => TextureNode
  }
): TextureNode => {
  if (node.isTextureNode === true || node.isSampleNode === true) {
    return node as TextureNode
  }
  if (node.getTextureNode != null) {
    return node.getTextureNode()
  }
  return new RenderTargetNode(node)
}
