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
  type Data3DTexture,
  type WebGLRenderer
} from 'three'
import { EXRExporter } from 'three/addons/exporters/EXRExporter.js'

import type { AnyFloatType } from '@takram/three-geospatial'

export async function createEXR3DTexture(
  renderer: WebGLRenderer,
  texture: Data3DTexture,
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

  const { width, height, depth } = texture
  const renderTarget = new WebGLRenderTarget(width, height * depth, {
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

export async function saveEXR3DTexture(
  renderer: WebGLRenderer,
  texture: Data3DTexture,
  fileName: string,
  type?: AnyFloatType
): Promise<void> {
  const buffer = await createEXR3DTexture(renderer, texture, type)
  const blob = new Blob([buffer])
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
