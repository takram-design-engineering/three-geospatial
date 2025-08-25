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

export abstract class SeparableFilterNode extends TempNode {
  inputNode: TextureNode | null
  iterations = 1
  resolutionScale = 0.5

  private readonly horizontalRT = createRenderTarget('GaussianBlur.Horizontal')
  private readonly verticalRT = createRenderTarget('GaussianBlur.Vertical')
  private readonly material = new NodeMaterial()
  private readonly mesh = new QuadMesh(this.material)

  private rendererState!: RendererUtils.RendererState
  protected readonly inputTexelSize = uniform(new Vector2())
  protected readonly direction = uniform(new Vector2())

  // WORKAROUND: The leading underscore avoids infinite recursion.
  // https://github.com/mrdoob/three.js/issues/31522
  private readonly _textureNode: TextureNode

  constructor(inputNode: TextureNode | null) {
    super('vec4')
    this.inputNode = inputNode

    const name = (this.constructor as typeof SeparableFilterNode).type
    this.horizontalRT = createRenderTarget(`${name}.Horizontal`)
    this.verticalRT = createRenderTarget(`${name}.Vertical`)

    this._textureNode = outputTexture(this, this.verticalRT.texture)

    this.updateBeforeType = NodeUpdateType.FRAME
  }

  getTextureNode(): TextureNode {
    return this._textureNode
  }

  setSize(width: number, height: number): this {
    const { resolutionScale } = this
    const w = Math.max(Math.round(width * resolutionScale), 1)
    const h = Math.max(Math.round(height * resolutionScale), 1)
    this.horizontalRT.setSize(w, h)
    this.verticalRT.setSize(w, h)
    return this
  }

  override updateBefore({ renderer }: NodeFrame): void {
    if (renderer == null) {
      return
    }

    const { horizontalRT, verticalRT, mesh, inputNode, direction } = this
    invariant(inputNode != null)

    const originalTexture = inputNode.value

    const { width, height } = inputNode.value
    this.setSize(width, height)
    this.inputTexelSize.value.set(1 / width, 1 / height)

    this.rendererState = resetRendererState(renderer, this.rendererState)

    for (let i = 0; i < this.iterations; ++i) {
      direction.value.set(1, 0)
      renderer.setRenderTarget(horizontalRT)
      mesh.render(renderer)
      inputNode.value = horizontalRT.texture

      direction.value.set(0, 1)
      renderer.setRenderTarget(verticalRT)
      mesh.render(renderer)
      inputNode.value = verticalRT.texture
    }

    restoreRendererState(renderer, this.rendererState)

    inputNode.value = originalTexture
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
    this.horizontalRT.dispose()
    this.verticalRT.dispose()
    this.material.dispose()
  }
}
