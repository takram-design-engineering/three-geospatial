import { texture } from 'three/tsl'
import {
  FramebufferTexture,
  Vector2,
  type Node,
  type Renderer,
  type TextureNode
} from 'three/webgpu'

import { convertToTexture } from '@takram/three-geospatial/webgpu'

import { HistogramTransform } from './HistogramTransform'
import { RasterTransform } from './RasterTransform'

const sizeScratch = /*#__PURE__*/ new Vector2()

export class VideoSource {
  renderer: Renderer | null

  readonly rasterTransform = new RasterTransform()
  readonly histogramTransform = new HistogramTransform()

  private inputNode: Node | null
  private textureNode!: TextureNode
  private readonly framebufferTexture = new FramebufferTexture(1, 1)

  constructor(renderer?: Renderer | null, inputNode?: Node | null) {
    this.renderer = renderer ?? null
    this.inputNode = inputNode ?? null
    this.resetInputNode(this.inputNode)
  }

  getTextureNode(): TextureNode {
    return this.textureNode
  }

  // For use in ref prop:
  readonly setRenderer = (value: Renderer | null): void => {
    this.renderer = value
  }

  private resetInputNode(value: Node | null): void {
    this.inputNode = value ?? null
    if (value != null) {
      this.textureNode = convertToTexture(value)
    } else {
      this.textureNode = texture(this.framebufferTexture)
    }
    this.rasterTransform.inputNode = this.textureNode
    this.histogramTransform.inputNode = this.textureNode
  }

  setInputNode(value: Node | null): void {
    if (value !== this.inputNode) {
      this.resetInputNode(value)
    }
  }

  update(): void {
    const { renderer, inputNode } = this
    if (renderer == null) {
      return
    }
    if (inputNode != null) {
      return // We have an input node, skip updating the framebuffer texture.
    }
    const { width, height } = renderer.getDrawingBufferSize(sizeScratch)
    const texture = this.framebufferTexture
    if (texture.image.width !== width || texture.image.height !== height) {
      texture.image.width = width
      texture.image.height = height
      texture.needsUpdate = true
    }
    renderer.copyFramebufferToTexture(texture)
  }

  dispose(): void {
    this.framebufferTexture.dispose()
  }
}
