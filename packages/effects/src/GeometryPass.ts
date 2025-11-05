import { RenderPass } from 'postprocessing'
import {
  HalfFloatType,
  type Camera,
  type DataTextureImageData,
  type Material,
  type Scene,
  type Texture,
  type WebGLRenderer,
  type WebGLRenderTarget
} from 'three'

import { reinterpretType } from '@takram/three-geospatial'

import { setupMaterialsForGeometryPass } from './setupMaterialsForGeometryPass'

export class GeometryPass extends RenderPass {
  readonly geometryTexture: Texture

  constructor(
    inputBuffer: WebGLRenderTarget,
    scene?: Scene,
    camera?: Camera,
    overrideMaterial?: Material
  ) {
    super(scene, camera, overrideMaterial)
    this.geometryTexture = inputBuffer.texture.clone()
    this.geometryTexture.isRenderTargetTexture = true
    // We could use UnsignedByteType but it causes banding in aerial
    // perspective's lighting.
    this.geometryTexture.type = HalfFloatType

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
      inputBuffer.textures[1] = this.geometryTexture
    }
    super.render(renderer, inputBuffer, null)
    if (inputBuffer != null) {
      inputBuffer.textures.length = 1
    }
  }

  override setSize(width: number, height: number): void {
    reinterpretType<DataTextureImageData>(this.geometryTexture.image)
    this.geometryTexture.image.width = width
    this.geometryTexture.image.height = height
  }
}
