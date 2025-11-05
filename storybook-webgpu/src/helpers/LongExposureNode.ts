import {
  Fn,
  globalId,
  If,
  luminance,
  max,
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
  type DataTextureImageData,
  type NodeBuilder,
  type NodeFrame,
  type Renderer,
  type TextureNode
} from 'three/webgpu'

import { reinterpretType } from '@takram/three-geospatial'
import {
  convertToTexture,
  outputTexture,
  type Node
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

function createStorageTexture(name: string): StorageTexture {
  const texture = new StorageTexture(1, 1)
  texture.type = FloatType
  texture.format = RedFormat
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.generateMipmaps = false
  texture.name = `LongExposureNode.${name}`
  return texture
}

const sizeScratch = /*#__PURE__*/ new Vector2()

// TODO: Refine and move to core.
export class LongExposureNode extends TempNode {
  static override get type(): string {
    return 'LongExposureNode'
  }

  inputNode: TextureNode

  shutterSpeed = uniform(4) // In seconds

  private readonly textureNode: TextureNode

  private currentRT = createRenderTarget('Current')
  private historyRT = createRenderTarget('History')
  private timerTexture = createStorageTexture('Timer')
  private readonly material = new NodeMaterial()
  private readonly copyMaterial = new NodeMaterial()
  private readonly mesh = new QuadMesh()
  private rendererState?: RendererUtils.RendererState
  private needsClearHistory = false

  private readonly currentNode = texture(this.currentRT.texture)
  private readonly historyNode = texture(this.historyRT.texture)
  private readonly timerNode = texture(this.timerTexture)

  private computeNode?: ComputeNode

  constructor(inputNode: TextureNode) {
    super('vec4')
    this.inputNode = inputNode

    this.textureNode = outputTexture(this, this.currentRT.texture)

    this.updateBeforeType = NodeUpdateType.FRAME
  }

  getTextureNode(): TextureNode {
    return this.textureNode
  }

  setSize(width: number, height: number): this {
    const { currentRT, historyRT } = this
    if (width !== historyRT.width || height !== historyRT.height) {
      currentRT.setSize(width, height)
      historyRT.setSize(width, height)
      this.needsClearHistory = true
    }
    return this
  }

  private clearHistory(renderer: Renderer): void {
    // Bind and clear the history render target to make sure it's initialized
    // after the resize which triggers a dispose().
    renderer.setRenderTarget(this.currentRT)
    renderer.clear()
    renderer.setRenderTarget(this.historyRT)
    renderer.clear()

    // TODO: Can we clear the contents of storage texture?
    const { width, height } = this.currentRT
    const timerTexture = this.timerTexture.clone()
    reinterpretType<DataTextureImageData>(timerTexture.image)
    timerTexture.image.width = width
    timerTexture.image.height = height
    this.timerTexture.dispose()
    this.timerTexture = timerTexture
    this.timerNode.value = timerTexture
    this.computeNode = undefined

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
    this.textureNode.value = currentRT.texture
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
      const size = uvec2(width, height)
      If(globalId.xy.greaterThanEqual(size).any(), () => {
        Return()
      })
      const input = this.inputNode.load(globalId.xy)
      const previous = this.currentNode.load(globalId.xy)
      If(luminance(input.rgb).greaterThanEqual(luminance(previous.rgb)), () => {
        textureStore(this.timerTexture, globalId.xy, time)
      })
    })().compute(
      // @ts-expect-error "count" can be dimensional
      [Math.ceil(width / 8), Math.ceil(height / 8), 1],
      [8, 8, 1]
    )

    void renderer.compute(this.computeNode)

    renderer.setRenderTarget(this.currentRT)
    this.mesh.material = this.material
    this.mesh.render(renderer)

    restoreRendererState(renderer, this.rendererState)

    this.swapBuffers()
  }

  override setup(builder: NodeBuilder): unknown {
    const { material, copyMaterial } = this

    material.fragmentNode = select(
      time.sub(this.timerNode.x).lessThan(this.shutterSpeed),
      max(this.inputNode, this.historyNode),
      this.inputNode
    )
    material.needsUpdate = true

    copyMaterial.fragmentNode = this.inputNode
    copyMaterial.needsUpdate = true

    this.textureNode.uvNode = this.inputNode.uvNode
    return this.textureNode
  }

  override dispose(): void {
    this.currentRT.dispose()
    this.historyRT.dispose()
    this.timerTexture.dispose()
    this.material.dispose()
    this.copyMaterial.dispose()
    this.mesh.geometry.dispose()
    super.dispose()
  }
}

export const longExposure = (inputNode: Node): LongExposureNode =>
  new LongExposureNode(convertToTexture(inputNode, 'LongExposureNode.Input'))
