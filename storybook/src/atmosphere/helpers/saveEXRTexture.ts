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
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer
} from 'three'
import { EXRExporter } from 'three/addons/exporters/EXRExporter.js'

import type { AnyFloatType } from '@takram/three-geospatial'

export async function createEXRTexture(
  renderer: WebGLRenderer,
  texture: Texture,
  type: AnyFloatType = HalfFloatType
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
    type,
    colorSpace: NoColorSpace
  })
  renderer.setRenderTarget(renderTarget)
  renderer.render(scene, camera)
  renderer.setRenderTarget(null)

  const exporter = new EXRExporter()
  const array = await exporter.parse(renderer, renderTarget, { type })

  material.dispose()
  renderTarget.dispose()
  return array.buffer
}

export async function saveEXRTexture(
  renderer: WebGLRenderer,
  texture: Texture,
  fileName: string,
  type?: AnyFloatType
): Promise<void> {
  const buffer = await createEXRTexture(renderer, texture, type)
  const blob = new Blob([buffer])
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
