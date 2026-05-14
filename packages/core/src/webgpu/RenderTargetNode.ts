import {
  HalfFloatType,
  RenderTarget,
  Vector2,
  type RenderTargetOptions,
  type Texture
} from 'three'
import {
  Node,
  NodeMaterial,
  NodeUpdateType,
  QuadMesh,
  RendererUtils,
  type NodeBuilder,
  type NodeFrame,
  type TextureNode
} from 'three/webgpu'
import invariant from 'tiny-invariant'

import { outputTexture } from './OutputTextureNode'

const { resetRendererState, restoreRendererState } = RendererUtils

function createRenderTarget(
  name: string,
  options?: RenderTargetOptions
): RenderTarget {
  const renderTarget = new RenderTarget(1, 1, {
    depthBuffer: false,
    type: HalfFloatType,
    ...options
  })
  const texture = renderTarget.texture
  texture.name = name
  return renderTarget
}

const sizeScratch = /*#__PURE__*/ new Vector2()

export interface RenderTargetNodeOptions extends RenderTargetOptions {
  name?: string
  resolutionScale?: number
  updateBeforeType?: NodeUpdateType
}

export class RenderTargetNode extends Node {
  static override get type(): string {
    return 'RenderTargetNode'
  }

  inputNode: Node | null
  resolutionScale: number

  private readonly textureNode: TextureNode
  private readonly renderTarget: RenderTarget
  private readonly material = new NodeMaterial()
  private readonly mesh = new QuadMesh(this.material)
  private rendererState?: RendererUtils.RendererState

  constructor(
    inputNode: Node | null = null,
    {
      name = 'RenderTarget',
      resolutionScale = 1,
      updateBeforeType = NodeUpdateType.FRAME,
      ...options
    }: RenderTargetNodeOptions = {}
  ) {
    super()
    this.updateBeforeType = updateBeforeType
    this.material.name = name
    this.mesh.name = name

    this.inputNode = inputNode
    this.resolutionScale = resolutionScale
    this.renderTarget = createRenderTarget(name, options)
    this.textureNode = outputTexture(this, this.renderTarget.texture)
  }

  getTexture(): Texture {
    return this.renderTarget.texture
  }

  getTextureNode(): TextureNode {
    return this.textureNode
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

    const { width, height } = renderer.getDrawingBufferSize(sizeScratch)
    this.setSize(width, height)

    this.rendererState = resetRendererState(renderer, this.rendererState)

    renderer.setRenderTarget(this.renderTarget)
    this.mesh.render(renderer)

    restoreRendererState(renderer, this.rendererState)
  }

  override setup(builder: NodeBuilder): unknown {
    invariant(this.inputNode != null, 'inputNode cannot be null during setup.')

    const { material } = this
    material.fragmentNode = this.inputNode.context(builder.getSharedContext())
    material.needsUpdate = true

    return this.textureNode
  }

  override dispose(): void {
    this.renderTarget.dispose()
    this.material.dispose()
    this.mesh.geometry.dispose()
    super.dispose()
  }
}

export const renderTarget = (
  ...args: ConstructorParameters<typeof RenderTargetNode>
): RenderTargetNode => new RenderTargetNode(...args)

type TextureNodeLike = Node & {
  isTextureNode?: boolean
  isSampleNode?: boolean
  getTextureNode?: () => TextureNode
}

export function convertToTexture(
  node: TextureNodeLike,
  options?: RenderTargetNodeOptions
): TextureNode

export function convertToTexture(
  node?: TextureNodeLike | null,
  options?: RenderTargetNodeOptions
): TextureNode | null

export function convertToTexture(
  node?: TextureNodeLike | null,
  options?: RenderTargetNodeOptions
): TextureNode | null {
  if (node == null) {
    return null
  }
  let textureNode: TextureNode
  if (node.isTextureNode === true || node.isSampleNode === true) {
    textureNode = node as TextureNode
  } else if (node.getTextureNode != null) {
    textureNode = node.getTextureNode()
  } else {
    textureNode = new RenderTargetNode(node, options).getTextureNode()
  }
  return textureNode
}
