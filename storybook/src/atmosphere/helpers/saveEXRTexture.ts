import {
  Camera,
  GLSL3,
  HalfFloatType,
  Mesh,
  NoColorSpace,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Uniform,
  WebGLRenderer,
  WebGLRenderTarget,
  type DataTexture,
  type FloatType
} from 'three'
import { EXRExporter } from 'three/addons/exporters/EXRExporter.js'

export async function createEXRTexture(
  texture: DataTexture,
  type: typeof FloatType | typeof HalfFloatType = HalfFloatType
): Promise<ArrayBuffer> {
  const material = new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: /* glsl */ `
      void main() {
        gl_Position = vec4(position.xy, 1.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp sampler2D;
      uniform sampler2D inputTexture;
      out vec4 outputColor;
      void main() {
        // Flipping Y isn't needed, as Texture already flipped it by default.
        outputColor = texelFetch(inputTexture, ivec2(gl_FragCoord.xy), 0);
        outputColor.a = 1.0;
      }
    `,
    uniforms: {
      inputTexture: new Uniform(texture)
    }
  })

  const quad = new Mesh(new PlaneGeometry(2, 2), material)
  const scene = new Scene()
  scene.add(quad)
  const camera = new Camera()

  const renderer = new WebGLRenderer()
  const renderTarget = new WebGLRenderTarget(
    texture.image.width,
    texture.image.height,
    {
      type,
      colorSpace: NoColorSpace
    }
  )
  renderer.setRenderTarget(renderTarget)
  renderer.render(scene, camera)

  const exporter = new EXRExporter()
  const array = await exporter.parse(renderer, renderTarget, { type })

  material.dispose()
  renderer.dispose()
  renderTarget.dispose()
  return array.buffer
}

export async function saveEXRTexture(
  texture: DataTexture,
  fileName: string,
  type?: typeof FloatType | typeof HalfFloatType
): Promise<void> {
  const buffer = await createEXRTexture(texture, type)
  const blob = new Blob([buffer])

  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
