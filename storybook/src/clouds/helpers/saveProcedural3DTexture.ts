import {
  Camera,
  GLSL3,
  Mesh,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Uniform,
  WebGLRenderer
} from 'three'
import invariant from 'tiny-invariant'

import type { Procedural3DTexture } from '@takram/three-clouds'

export function saveProcedural3DTexture(
  proceduralTexture: Procedural3DTexture,
  fileName: string
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
        ivec3 size = textureSize(inputTexture, 0);
        vec2 coord = vec2(gl_FragCoord.x, float(size.y) - gl_FragCoord.y);
        outputColor = vec4(vec3(texelFetch(inputTexture, ivec3(coord, layer), 0).r), 1.0);
      }
    `,
    uniforms: {
      inputTexture: new Uniform(proceduralTexture.texture),
      layer: new Uniform(0)
    }
  })

  const quad = new Mesh(new PlaneGeometry(2, 2), material)
  const scene = new Scene()
  scene.add(quad)
  const camera = new Camera()

  const renderer = new WebGLRenderer({ preserveDrawingBuffer: true })
  proceduralTexture.render(renderer)
  const { size } = proceduralTexture
  renderer.setSize(size, size)

  const canvas = document.createElement('canvas')
  invariant(canvas != null)
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  invariant(context != null)
  const buffer = new Uint8Array(size * size * size)

  for (let layer = 0; layer < size; ++layer) {
    material.uniforms.layer.value = layer
    renderer.render(scene, camera)

    context.drawImage(renderer.domElement, 0, 0)
    const imageData = context.getImageData(0, 0, size, size)
    for (
      let imageIndex = 0, bufferIndex = size * size * layer;
      imageIndex < size * size * 4;
      imageIndex += 4, ++bufferIndex
    ) {
      buffer[bufferIndex] = imageData.data[imageIndex]
    }
  }

  const blob = new Blob([buffer], { type: 'application/octet-stream' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)

  proceduralTexture.dispose()
  material.dispose()
  renderer.dispose()
}
