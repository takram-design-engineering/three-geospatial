import {
  HalfFloatType,
  RenderTarget,
  type RenderTargetOptions,
  type Texture
} from 'three'
import {
  NodeUpdateType,
  TempNode,
  type NodeBuilder,
  type TextureNode
} from 'three/webgpu'
import invariant from 'tiny-invariant'

import type { Node } from './node'
import { outputTexture } from './OutputTextureNode'

// Represents a node that applies a shader on the input texture and outputs
// another texture of the same dimensions regardless of the drawing buffer size.
export abstract class FilterNode extends TempNode {
  static override get type(): string {
    return 'FilterNode'
  }

  inputNode: TextureNode | null
  resolutionScale = 1

  private outputNode?: TextureNode
  private readonly renderTargets: RenderTarget[] = []

  constructor(inputNode: TextureNode | null = null) {
    super('vec4')
    this.updateBeforeType = NodeUpdateType.FRAME

    this.inputNode = inputNode
  }

  protected createRenderTarget(
    name?: string,
    options?: RenderTargetOptions
  ): RenderTarget {
    const renderTarget = new RenderTarget(1, 1, {
      depthBuffer: false,
      type: HalfFloatType,
      ...options
    })
    const texture = renderTarget.texture

    const typeName = (this.constructor as typeof Node).type.replace(/Node$/, '')
    texture.name = name != null ? `${typeName}_${name}` : typeName

    this.renderTargets.push(renderTarget)
    return renderTarget
  }

  getTextureNode(): TextureNode {
    const { outputNode } = this
    invariant(outputNode != null, 'outputNode cannot be null.')
    return outputNode
  }

  abstract setSize(width: number, height: number): this

  protected get outputTexture(): Texture | null {
    return this.outputNode?.value ?? null
  }

  protected set outputTexture(value: Texture | null) {
    this.outputNode = value != null ? outputTexture(this, value) : undefined
  }

  override setup(builder: NodeBuilder): unknown {
    const { inputNode, outputNode } = this
    invariant(inputNode != null, 'inputNode cannot be null during setup.')
    invariant(outputNode != null, 'outputNode cannot be null during setup.')
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
