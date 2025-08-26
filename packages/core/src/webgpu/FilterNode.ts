import {
  ClampToEdgeWrapping,
  LinearFilter,
  RenderTarget,
  RGBAFormat,
  type Texture,
  type TextureDataType
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
    let typeName = (this.constructor as typeof FilterNode).type
    typeName = typeName.endsWith('Node') ? typeName.slice(0, -4) : typeName

    const renderTarget = new RenderTarget(1, 1, {
      depthBuffer: false,
      format: RGBAFormat,
      type: 0 as unknown as TextureDataType // Type is determined during setup()
    })
    const texture = renderTarget.texture
    texture.minFilter = LinearFilter
    texture.magFilter = LinearFilter
    texture.wrapS = ClampToEdgeWrapping
    texture.wrapT = ClampToEdgeWrapping
    texture.generateMipmaps = false
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
      'inputNode must be specified before being setting up.'
    )
    invariant(
      outputNode != null,
      'outputNode must be specified by setOutputTexture() before being setting up.'
    )
    outputNode.uvNode = inputNode.uvNode

    // Use the same texture type to the input node if not overwritten.
    for (const { texture } of this.renderTargets) {
      if ((texture.type as number) === 0) {
        texture.type = inputNode.value.type
      }
    }
    return outputNode
  }

  override dispose(): void {
    for (const renderTarget of this.renderTargets) {
      renderTarget.dispose()
    }
    super.dispose()
  }
}
