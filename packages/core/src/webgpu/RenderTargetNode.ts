import { nodeObject, uv } from 'three/tsl'
import {
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

function createRenderTarget(name?: string): RenderTarget {
  const renderTarget = new RenderTarget(1, 1, {
    depthBuffer: false,
    type: HalfFloatType,
    format: RGBAFormat
  })
  const texture = renderTarget.texture
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.generateMipmaps = false
  texture.name = name != null ? `RenderTargetNode.${name}` : 'RenderTargetNode'
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

  constructor(node: Node, name?: string) {
    const renderTarget = createRenderTarget(name)
    super(renderTarget.texture, uv())
    this.node = node
    this.renderTarget = renderTarget
    this.updateBeforeType = NodeUpdateType.FRAME
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
    // I don't fully understand why, but updates on "node" doesn't propagate
    // unless giving the builder context.
    material.fragmentNode = nodeObject(this.node).context(builder.getContext())
    material.needsUpdate = true
    return super.setup(builder)
  }

  override dispose(): void {
    this.material.dispose()
    super.dispose()
  }

  // @ts-expect-error Ignore
  override clone(): TextureNode {
    const result = new TextureNode(this.value, this.uvNode, this.levelNode)
    result.sampler = this.sampler
    result.referenceNode = this
    return result
  }
}

export const convertToTexture = (
  node: Node & {
    isTextureNode?: boolean
    isSampleNode?: boolean
    getTextureNode?: () => TextureNode
  },
  name?: string
): TextureNode => {
  if (node.isTextureNode === true || node.isSampleNode === true) {
    return node as TextureNode
  }
  if (node.getTextureNode != null) {
    return node.getTextureNode()
  }
  return new RenderTargetNode(node, name)
}
