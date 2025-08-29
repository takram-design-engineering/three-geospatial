import {
  ClampToEdgeWrapping,
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

export abstract class FilterNode extends TempNode {
  inputNode?: TextureNode | null
  resolutionScale = 1

  // WORKAROUND: The leading underscore avoids infinite recursion.
  // https://github.com/mrdoob/three.js/issues/31522
  private _textureNode?: TextureNode

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
    texture.wrapS = ClampToEdgeWrapping
    texture.wrapT = ClampToEdgeWrapping
    texture.generateMipmaps = false

    const typeName = (this.constructor as typeof FilterNode).type
    texture.name = name != null ? `${typeName}.${name}` : typeName

    this.renderTargets.push(renderTarget)
    return renderTarget
  }

  getTextureNode(): TextureNode {
    invariant(
      this._textureNode != null,
      'outputNode must be specified by setOutputTexture() before getTextureNode() is called.'
    )
    return this._textureNode
  }

  protected setOutputTexture(value: Texture): this {
    this._textureNode = outputTexture(this, value)
    return this
  }

  abstract setSize(width: number, height: number): this

  override setup(builder: NodeBuilder): unknown {
    const { inputNode, _textureNode: outputNode } = this
    invariant(
      inputNode != null,
      'inputNode must be specified before being setup.'
    )
    invariant(
      outputNode != null,
      'outputNode must be specified by setOutputTexture() before being setup.'
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
