import { ScreenQuad } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { button } from 'leva'
import { useEffect, useMemo, type FC } from 'react'
import { GLSL3, ShaderMaterial, Uniform, Vector2 } from 'three'

import type { Procedural3DTexture } from '@takram/three-clouds'

import { useControls } from '../../helpers/useControls'
import { saveProcedural3DTexture } from './saveProcedural3DTexture'

export const Procedural3DTextureViewer: FC<{
  createProceduralTexture: () => Procedural3DTexture
  fileName: string
}> = ({ createProceduralTexture, fileName }) => {
  const proceduralTexture = useMemo(
    () => createProceduralTexture(),
    [createProceduralTexture]
  )

  const material = useMemo(
    () =>
      new ShaderMaterial({
        glslVersion: GLSL3,
        vertexShader,
        fragmentShader,
        uniforms: {
          resolution: new Uniform(new Vector2()),
          size: new Uniform(proceduralTexture.size),
          columns: new Uniform(0),
          inputTexture: new Uniform(proceduralTexture.texture),
          gammaCorrect: new Uniform(false)
        }
      }),
    [proceduralTexture]
  )

  const { gl } = useThree()
  useEffect(() => {
    proceduralTexture.render(gl)
  }, [proceduralTexture, gl])

  const { gammaCorrect } = useControls(
    {
      gammaCorrect: false,
      save: button(() => {
        saveProcedural3DTexture(createProceduralTexture(), fileName)
      })
    },
    [fileName]
  )

  useFrame(({ size }) => {
    material.uniforms.resolution.value.set(size.width, size.height)
    material.uniforms.columns.value = Math.floor(
      size.width / proceduralTexture.size
    )
    material.uniforms.gammaCorrect.value = gammaCorrect
  })

  return <ScreenQuad material={material} />
}

const vertexShader = /* glsl */ `
  out vec2 vUv;

  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  precision highp float;
  precision highp sampler3D;

  in vec2 vUv;

  out vec4 outputColor;

  uniform vec2 resolution;
  uniform float size;
  uniform int columns;
  uniform sampler3D inputTexture;
  uniform bool gammaCorrect;

  void main() {
    vec2 uv = vec2(vUv.x, 1.0 - vUv.y) * resolution / size;
    ivec2 xy = ivec2(uv);
    if (xy.x >= columns) {
      discard;
    }
    int index = xy.y * columns + xy.x % columns;
    if (index >= int(size)) {
      discard;
    }
    vec3 uvw = vec3(fract(uv), (float(index)) / size);
    vec4 color = vec4(vec3(texture(inputTexture, uvw).r), 1.0);
    outputColor = gammaCorrect ? linearToOutputTexel(color) : color;
  }
`
