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

import type { ProceduralTexture } from '@takram/three-clouds'

export async function saveProceduralTexture(
  proceduralTexture: ProceduralTexture,
  fileName: string
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
        // Flipping Y isn't needed, as Texture already flipped it by default.
        outputColor = texelFetch(inputTexture, ivec2(gl_FragCoord.xy), 0);
      }
    `,
    uniforms: {
      inputTexture: new Uniform(proceduralTexture.texture)
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
  renderer.render(scene, camera)

  await new Promise<void>(resolve => {
    renderer.domElement.toBlob(blob => {
      if (blob != null) {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = fileName
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      }
      resolve()
    })
  })

  proceduralTexture.dispose()
  material.dispose()
  renderer.dispose()
}
