import {
  Camera,
  FloatType,
  GLSL3,
  HalfFloatType,
  Mesh,
  NoColorSpace,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Uniform,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer
} from 'three'

import { Float16Array, type AnyFloatType } from '@takram/three-geospatial'

export async function saveBinaryTexture(
  renderer: WebGLRenderer,
  texture: Texture,
  fileName: string,
  type: AnyFloatType = HalfFloatType
): Promise<void> {
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
        outputColor = texelFetch(inputTexture, ivec2(gl_FragCoord.xy), 0);
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

  const { width, height } = texture
  const renderTarget = new WebGLRenderTarget(width, height, {
    type: FloatType,
    colorSpace: NoColorSpace
  })
  renderer.setRenderTarget(renderTarget)
  renderer.render(scene, camera)
  renderer.setRenderTarget(null)

  const array = new Float32Array(width * height * 4)
  await renderer.readRenderTargetPixelsAsync(
    renderTarget,
    0,
    0,
    width,
    height,
    array
  )

  const blob = new Blob([
    type === HalfFloatType ? new Float16Array(array).buffer : array.buffer
  ])
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
