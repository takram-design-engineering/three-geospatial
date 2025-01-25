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

export interface Render3DTextureParameters {
  size: number
  fragmentShader: string
}

export class Render3DTexture {
  readonly size: number
  needsUpdate = true

  private readonly material: RawShaderMaterial
  private readonly mesh: Mesh
  private readonly renderTarget: WebGL3DRenderTarget
  private readonly camera = new Camera()

  constructor({ size, fragmentShader }: Render3DTextureParameters) {
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

    this.renderTarget = new WebGL3DRenderTarget(size, size, size, {
      depthBuffer: false,
      stencilBuffer: false,
      format: RedFormat
    })
    const texture = this.renderTarget.texture
    texture.minFilter = LinearFilter
    texture.magFilter = LinearFilter
    texture.wrapS = RepeatWrapping
    texture.wrapT = RepeatWrapping
    texture.wrapR = RepeatWrapping
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

    // Unfortunately, rendering into 3D target requires as many draw calls as
    // the value of "size".
    const renderTarget = renderer.getRenderTarget()
    for (let layer = 0; layer < this.size; ++layer) {
      this.material.uniforms.layer.value = layer / this.size
      renderer.setRenderTarget(this.renderTarget, layer)
      renderer.render(this.mesh, this.camera)
    }
    renderer.setRenderTarget(renderTarget)
  }

  get texture(): Data3DTexture {
    return this.renderTarget.texture
  }
}
