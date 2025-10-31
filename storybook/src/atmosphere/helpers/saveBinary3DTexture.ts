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

export function saveBinary3DTexture(
  renderer: WebGLRenderer,
  texture: Texture,
  fileName: string,
  type: AnyFloatType = HalfFloatType
): void {
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
      uniform int layer;
      out vec4 outputColor;
      void main() {
        outputColor = texelFetch(inputTexture, ivec3(gl_FragCoord.xy, layer), 0);
      }
    `,
    uniforms: {
      inputTexture: new Uniform(texture),
      layer: new Uniform(0)
    }
  })

  const quad = new Mesh(new PlaneGeometry(2, 2), material)
  const scene = new Scene()
  scene.add(quad)
  const camera = new Camera()

  const { width, height, depth } = texture
  const renderTarget = new WebGLRenderTarget(width, height, {
    type: FloatType,
    colorSpace: NoColorSpace
  })

  const array = new Float32Array(width * height * depth * 4)
  for (let layer = 0; layer < depth; ++layer) {
    material.uniforms.layer.value = layer
    renderer.setRenderTarget(renderTarget)
    renderer.render(scene, camera)
    renderer.readRenderTargetPixels(
      renderTarget,
      0,
      0,
      width,
      height,
      array.subarray(width * height * 4 * layer)
    )
  }
  renderer.setRenderTarget(null)

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
