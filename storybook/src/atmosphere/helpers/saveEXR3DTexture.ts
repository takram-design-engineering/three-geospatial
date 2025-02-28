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
  type Data3DTexture
} from 'three'
import { EXRExporter } from 'three/addons/exporters/EXRExporter.js'

export async function createEXR3DTexture(
  texture: Data3DTexture
): Promise<ArrayBuffer> {
  const material = new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: /* glsl */ `
      void main() {
        gl_Position = vec4(position.xy, 1.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp sampler3D;
      uniform sampler3D inputTexture;
      out vec4 outputColor;
      void main() {
        ivec3 size = textureSize(inputTexture, 0);
        ivec3 coord = ivec3(
          gl_FragCoord.x,
          int(gl_FragCoord.y) % size.y,
          floor(gl_FragCoord.y / float(size.y))
        );
        outputColor = texelFetch(inputTexture, coord, 0);
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
    texture.image.height * texture.image.depth,
    {
      type: HalfFloatType,
      colorSpace: NoColorSpace
    }
  )
  renderer.setRenderTarget(renderTarget)
  renderer.render(scene, camera)

  const exporter = new EXRExporter()
  const array = await exporter.parse(renderer, renderTarget, {
    type: HalfFloatType
  })

  material.dispose()
  renderer.dispose()
  renderTarget.dispose()
  return array.buffer
}

export async function saveEXR3DTexture(
  texture: Data3DTexture,
  fileName: string
): Promise<void> {
  const buffer = await createEXR3DTexture(texture)
  const blob = new Blob([buffer])

  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
