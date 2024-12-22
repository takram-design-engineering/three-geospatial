import {
  Camera,
  GLSL3,
  LinearFilter,
  Mesh,
  NoColorSpace,
  PlaneGeometry,
  RawShaderMaterial,
  RepeatWrapping,
  RGBAFormat,
  Uniform,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer
} from 'three'

export interface RenderTextureParameters {
  size: number
  fragmentShader: string
}

export class RenderTexture {
  readonly size: number
  needsUpdate = true

  private readonly material: RawShaderMaterial
  private readonly mesh: Mesh
  private readonly renderTarget: WebGLRenderTarget
  private readonly camera = new Camera()

  constructor({ size, fragmentShader }: RenderTextureParameters) {
    this.size = size
    this.material = new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: /* glsl */ `
        in vec2 uv;
        out vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
        }
      `,
      fragmentShader,
      uniforms: {
        layer: new Uniform(0)
      }
    })
    this.mesh = new Mesh(new PlaneGeometry(2, 2), this.material)

    this.renderTarget = new WebGLRenderTarget(size, size, {
      depthBuffer: false,
      stencilBuffer: false,
      format: RGBAFormat
    })
    const texture = this.renderTarget.texture
    texture.minFilter = LinearFilter
    texture.magFilter = LinearFilter
    texture.wrapS = RepeatWrapping
    texture.wrapT = RepeatWrapping
    texture.colorSpace = NoColorSpace
  }

  dispose(): void {
    this.renderTarget.dispose()
    this.material.dispose()
  }

  update(renderer: WebGLRenderer): void {
    if (!this.needsUpdate) {
      return
    }
    this.needsUpdate = false

    const renderTarget = renderer.getRenderTarget()
    renderer.setRenderTarget(this.renderTarget)
    renderer.render(this.mesh, this.camera)
    renderer.setRenderTarget(renderTarget)
  }

  get texture(): Texture {
    return this.renderTarget.texture
  }
}
