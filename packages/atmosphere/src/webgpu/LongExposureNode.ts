import {
  Fn,
  If,
  instanceIndex,
  ivec2,
  luminance,
  max,
  nodeObject,
  Return,
  select,
  texture,
  textureStore,
  time,
  uniform,
  uvec2
} from 'three/tsl'
import {
  FloatType,
  HalfFloatType,
  LinearFilter,
  NodeMaterial,
  NodeUpdateType,
  QuadMesh,
  RedFormat,
  RendererUtils,
  RenderTarget,
  RGBAFormat,
  StorageTexture,
  TempNode,
  Vector2,
  type ComputeNode,
  type NodeBuilder,
  type NodeFrame,
  type Renderer,
  type TextureNode
} from 'three/webgpu'

import {
  convertToTexture,
  outputTexture,
  type Node,
  type NodeObject
} from '@takram/three-geospatial/webgpu'

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
  texture.name = `LongExposureNode.${name}`
  return renderTarget
}

const sizeScratch = /*#__PURE__*/ new Vector2()

// TODO: Refine and move to core.
export class LongExposureNode extends TempNode {
  static override get type(): string {
    return 'LongExposureNode'
  }

  inputNode: TextureNode

  shutterSpeed = uniform(4)

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
  private readonly historyNode = texture(this.historyRT.texture)

  private readonly timerTexture = new StorageTexture()
  private computeNode?: ComputeNode

  constructor(inputNode: TextureNode) {
    super('vec4')
    this.inputNode = inputNode

    this.timerTexture.type = FloatType
    this.timerTexture.format = RedFormat

    this._textureNode = outputTexture(this, this.currentRT.texture)

    this.updateBeforeType = NodeUpdateType.FRAME
  }

  getTextureNode(): TextureNode {
    return this._textureNode
  }

  setSize(width: number, height: number): this {
    const { currentRT, historyRT, timerTexture } = this
    if (width !== historyRT.width || height !== historyRT.height) {
      currentRT.setSize(width, height)
      historyRT.setSize(width, height)
      timerTexture.image.width = width
      timerTexture.image.height = height
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
    this.historyNode.value = currentRT.texture

    // The output node must point to the current texture.
    this._textureNode.value = currentRT.texture
  }

  override updateBefore({ renderer }: NodeFrame): void {
    if (renderer == null) {
      return
    }

    const size = renderer.getDrawingBufferSize(sizeScratch)
    const { width, height } = size
    this.setSize(width, height)

    this.rendererState = resetRendererState(renderer, this.rendererState)

    if (this.needsClearHistory) {
      this.clearHistory(renderer)
    }

    this.computeNode ??= Fn(() => {
      const id = instanceIndex
      const x = id.mod(width)
      const y = id.div(width)
      const size = uvec2(width, height)
      If(uvec2(x, y).greaterThanEqual(size).any(), () => {
        Return()
      })
      const coord = ivec2(x, y)
      const input = this.inputNode.load(coord)
      const previous = this.currentNode.load(coord)
      If(luminance(input.rgb).greaterThanEqual(luminance(previous.rgb)), () => {
        textureStore(this.timerTexture, coord, time)
      })
    })().compute(width * height)

    void renderer.compute(this.computeNode)

    renderer.setRenderTarget(this.currentRT)
    this.mesh.material = this.resolveMaterial
    this.mesh.render(renderer)

    restoreRendererState(renderer, this.rendererState)

    this.swapBuffers()
  }

  override setup(builder: NodeBuilder): unknown {
    const { resolveMaterial, copyMaterial } = this

    const inputNode = nodeObject(this.inputNode)
    const timerNode = texture(this.timerTexture)
    resolveMaterial.fragmentNode = select(
      time.sub(timerNode.x).lessThan(this.shutterSpeed),
      max(inputNode, this.historyNode),
      inputNode
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
    this.timerTexture.dispose()
    this.resolveMaterial.dispose()
    this.copyMaterial.dispose()
    super.dispose()
  }
}

export const longExposure = (inputNode: Node): NodeObject<LongExposureNode> =>
  nodeObject(new LongExposureNode(convertToTexture(inputNode)))
