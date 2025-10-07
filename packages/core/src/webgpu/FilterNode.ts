import {
  HalfFloatType,
  LinearFilter,
  RenderTarget,
  RGBAFormat,
  type Texture
} from 'three'
import {
  NodeUpdateType,
  TempNode,
  type NodeBuilder,
  type TextureNode
} from 'three/webgpu'
import invariant from 'tiny-invariant'

import { outputTexture } from './OutputTextureNode'

// Represents a node that applies a shader on the input texture and outputs
// another texture of the same dimensions regardless of the drawing buffer size.
export abstract class FilterNode extends TempNode {
  static override get type(): string {
    return 'FilterNode'
  }

  inputNode?: TextureNode | null
  resolutionScale = 1

  private textureNode?: TextureNode
  private readonly renderTargets: RenderTarget[] = []

  constructor(inputNode?: TextureNode | null) {
    super('vec4')
    this.inputNode = inputNode
    this.updateBeforeType = NodeUpdateType.FRAME
  }

  protected createRenderTarget(name?: string): RenderTarget {
    const renderTarget = new RenderTarget(1, 1, {
      depthBuffer: false,
      type: HalfFloatType,
      format: RGBAFormat
    })
    const texture = renderTarget.texture
    texture.minFilter = LinearFilter
    texture.magFilter = LinearFilter
    texture.generateMipmaps = false

    const typeName = (this.constructor as typeof FilterNode).type
    texture.name = name != null ? `${typeName}.${name}` : typeName

    this.renderTargets.push(renderTarget)
    return renderTarget
  }

  getTextureNode(): TextureNode {
    invariant(
      this.textureNode != null,
      'outputTexture must be specified before getTextureNode() is called.'
    )
    return this.textureNode
  }

  protected get outputTexture(): Texture | null {
    return this.textureNode?.value ?? null
  }

  protected set outputTexture(value: Texture | null) {
    this.textureNode = value != null ? outputTexture(this, value) : undefined
  }

  abstract setSize(width: number, height: number): this

  override setup(builder: NodeBuilder): unknown {
    const { inputNode, textureNode: outputNode } = this
    invariant(
      inputNode != null,
      'inputNode must be specified before being setup.'
    )
    invariant(
      outputNode != null,
      'outputTexture must be specified before being setup.'
    )
    outputNode.uvNode = inputNode.uvNode
    return outputNode
  }

  override dispose(): void {
    for (const renderTarget of this.renderTargets) {
      renderTarget.dispose()
    }
    super.dispose()
  }
}
