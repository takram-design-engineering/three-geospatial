import { RenderPass } from 'postprocessing'
import {
  HalfFloatType,
  type Camera,
  type Material,
  type Scene,
  type Texture,
  type WebGLRenderer,
  type WebGLRenderTarget
} from 'three'

import { setupMaterialsForGeometryPass } from './setupMaterialsForGeometryPass'

export class GeometryPass extends RenderPass {
  readonly normalPBRTexture: Texture

  constructor(
    inputBuffer: WebGLRenderTarget,
    scene?: Scene,
    camera?: Camera,
    overrideMaterial?: Material
  ) {
    super(scene, camera, overrideMaterial)
    this.normalPBRTexture = inputBuffer.texture.clone()
    this.normalPBRTexture.isRenderTargetTexture = true
    // We could use UnsignedByteType but it causes banding in aerial
    // perspective's lighting.
    this.normalPBRTexture.type = HalfFloatType

    setupMaterialsForGeometryPass()
  }

  override render(
    renderer: WebGLRenderer,
    inputBuffer: WebGLRenderTarget | null,
    outputBuffer: WebGLRenderTarget | null,
    deltaTime?: number,
    stencilTest?: boolean
  ): void {
    if (inputBuffer != null) {
      inputBuffer.textures[1] = this.normalPBRTexture
    }
    super.render(renderer, inputBuffer, null)
    if (inputBuffer != null) {
      inputBuffer.textures.length = 1
    }
  }

  setSize(width: number, height: number): void {
    this.normalPBRTexture.image.width = width
    this.normalPBRTexture.image.height = height
  }
}
