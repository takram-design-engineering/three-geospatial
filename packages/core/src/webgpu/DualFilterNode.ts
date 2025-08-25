import {
  ClampToEdgeWrapping,
  HalfFloatType,
  LinearFilter,
  RenderTarget,
  RGBAFormat,
  Vector2
} from 'three'
import { texture, uniform } from 'three/tsl'
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
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.generateMipmaps = false
  texture.name = name
  return renderTarget
}

export abstract class DualFilterNode extends TempNode {
  inputNode: TextureNode | null
  resolutionScale = 1

  private readonly downsampleRTs: RenderTarget[] = []
  private readonly upsampleRTs: RenderTarget[] = []
  private readonly downsampleMaterial = new NodeMaterial()
  private readonly upsampleMaterial = new NodeMaterial()
  private readonly mesh = new QuadMesh()
  private rendererState!: RendererUtils.RendererState

  protected readonly inputTexelSize = uniform(new Vector2())
  protected readonly downsampleNode = texture(null)

  // WORKAROUND: The leading underscore avoids infinite recursion.
  // https://github.com/mrdoob/three.js/issues/31522
  private readonly _textureNode: TextureNode

  constructor(inputNode: TextureNode | null, levels: number) {
    super('vec4')
    this.inputNode = inputNode

    const name = (this.constructor as typeof DualFilterNode).type
    for (let i = 0; i < levels; ++i) {
      this.downsampleRTs[i] = createRenderTarget(`${name}.Downsample${i}`)
      if (i < levels - 1) {
        this.upsampleRTs[i] = createRenderTarget(`${name}.Upsample${i}`)
      }
    }

    this._textureNode = outputTexture(this, this.upsampleRTs[0].texture)

    this.updateBeforeType = NodeUpdateType.FRAME
  }

  getTextureNode(): TextureNode {
    return this._textureNode
  }

  setSize(width: number, height: number): this {
    const { resolutionScale } = this
    let w = Math.max(Math.round(width * resolutionScale), 1)
    let h = Math.max(Math.round(height * resolutionScale), 1)

    const { downsampleRTs, upsampleRTs } = this
    for (let i = 0; i < downsampleRTs.length; ++i) {
      w = Math.max(Math.round(w / 2), 1)
      h = Math.max(Math.round(h / 2), 1)
      downsampleRTs[i].setSize(w, h)
      if (i < upsampleRTs.length) {
        upsampleRTs[i].setSize(w, h)
      }
    }
    return this
  }

  override updateBefore({ renderer }: NodeFrame): void {
    if (renderer == null) {
      return
    }
    const {
      downsampleRTs,
      upsampleRTs,
      mesh,
      inputNode,
      inputTexelSize,
      downsampleNode
    } = this
    invariant(inputNode != null)

    const originalTexture = inputNode.value

    const { width, height } = inputNode.value
    this.setSize(width, height)

    this.rendererState = resetRendererState(renderer, this.rendererState)

    mesh.material = this.downsampleMaterial
    for (const renderTarget of downsampleRTs) {
      const { width, height } = inputNode.value
      inputTexelSize.value.set(1 / width, 1 / height)
      renderer.setRenderTarget(renderTarget)
      mesh.render(renderer)
      inputNode.value = renderTarget.texture
    }

    mesh.material = this.upsampleMaterial
    for (let i = upsampleRTs.length - 1; i >= 0; --i) {
      const renderTarget = upsampleRTs[i]
      const { width, height } = inputNode.value
      inputTexelSize.value.set(1 / width, 1 / height)
      downsampleNode.value = downsampleRTs[i].texture
      renderer.setRenderTarget(renderTarget)
      mesh.render(renderer)
      inputNode.value = renderTarget.texture
    }

    restoreRendererState(renderer, this.rendererState)

    inputNode.value = originalTexture
  }

  protected abstract setupDownsampleNode(): Node
  protected abstract setupUpsampleNode(): Node

  override setup(builder: NodeBuilder): unknown {
    const { inputNode } = this
    invariant(inputNode != null)

    const { downsampleMaterial, upsampleMaterial } = this
    downsampleMaterial.fragmentNode = this.setupDownsampleNode()
    upsampleMaterial.fragmentNode = this.setupUpsampleNode()
    downsampleMaterial.needsUpdate = true
    upsampleMaterial.needsUpdate = true

    this._textureNode.uvNode = inputNode.uvNode
    return this._textureNode
  }

  override dispose(): void {
    super.dispose()
    for (const downsampleRT of this.downsampleRTs) {
      downsampleRT.dispose()
    }
    for (const upsampleRT of this.upsampleRTs) {
      upsampleRT.dispose()
    }
    this.downsampleMaterial.dispose()
    this.upsampleMaterial.dispose()
  }
}
