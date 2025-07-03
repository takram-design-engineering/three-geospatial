import {
  Camera,
  GLSL3,
  LinearFilter,
  Mesh,
  NoColorSpace,
  PlaneGeometry,
  RawShaderMaterial,
  RedFormat,
  RepeatWrapping,
  Uniform,
  WebGL3DRenderTarget,
  type Data3DTexture,
  type WebGLRenderer
} from 'three'

import type { ProceduralTexture } from './ProceduralTexture'

export type Procedural3DTexture = ProceduralTexture<Data3DTexture>

export interface Procedural3DTextureBaseParameters {
  size: number
  fragmentShader: string
}

export class Procedural3DTextureBase implements Procedural3DTexture {
  readonly size: number
  needsRender = true

  private readonly material: RawShaderMaterial
  private readonly mesh: Mesh
  private readonly renderTarget: WebGL3DRenderTarget
  private readonly camera = new Camera()

  constructor({ size, fragmentShader }: Procedural3DTextureBaseParameters) {
    this.size = size
    this.material = new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: /* glsl */ `
        in vec3 position;
        out vec2 vUv;
        void main() {
          vUv = position.xy * 0.5 + 0.5;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader,
      uniforms: {
        layer: new Uniform(0)
      }
    })
    this.mesh = new Mesh(new PlaneGeometry(2, 2), this.material)

    this.renderTarget = new WebGL3DRenderTarget(size, size, size, {
      depthBuffer: false,
      format: RedFormat
    })
    const texture = this.renderTarget.texture
    texture.minFilter = LinearFilter
    texture.magFilter = LinearFilter
    texture.wrapS = RepeatWrapping
    texture.wrapT = RepeatWrapping
    texture.wrapR = RepeatWrapping
    texture.colorSpace = NoColorSpace
    texture.needsUpdate = true
  }

  dispose(): void {
    this.renderTarget.dispose()
    this.material.dispose()
  }

  render(renderer: WebGLRenderer, deltaTime?: number): void {
    if (!this.needsRender) {
      return
    }
    this.needsRender = false

    // Unfortunately, rendering into 3D target requires as many draw calls as
    // the value of "size".
    for (let layer = 0; layer < this.size; ++layer) {
      this.material.uniforms.layer.value = layer / this.size
      renderer.setRenderTarget(this.renderTarget, layer)
      renderer.render(this.mesh, this.camera)
    }
    renderer.setRenderTarget(null)
  }

  get texture(): Data3DTexture {
    return this.renderTarget.texture
  }
}
