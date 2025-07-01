import {
  Camera,
  GLSL3,
  LinearFilter,
  LinearMipMapLinearFilter,
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

export interface ProceduralTexture<T extends Texture = Texture> {
  readonly size: number
  readonly texture: T

  dispose: () => void
  render: (renderer: WebGLRenderer, deltaTime?: number) => void
}

export interface ProceduralTextureBaseParameters {
  size: number
  fragmentShader: string
}

export class ProceduralTextureBase implements ProceduralTexture {
  readonly size: number
  needsRender = true

  private readonly material: RawShaderMaterial
  private readonly mesh: Mesh
  private readonly renderTarget: WebGLRenderTarget
  private readonly camera = new Camera()

  constructor({ size, fragmentShader }: ProceduralTextureBaseParameters) {
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

    this.renderTarget = new WebGLRenderTarget(size, size, {
      depthBuffer: false,
      format: RGBAFormat
    })
    const texture = this.renderTarget.texture
    texture.generateMipmaps = true
    texture.minFilter = LinearMipMapLinearFilter
    texture.magFilter = LinearFilter
    texture.wrapS = RepeatWrapping
    texture.wrapT = RepeatWrapping
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

    renderer.setRenderTarget(this.renderTarget)
    renderer.render(this.mesh, this.camera)
    renderer.setRenderTarget(null)
  }

  get texture(): Texture {
    return this.renderTarget.texture
  }
}
