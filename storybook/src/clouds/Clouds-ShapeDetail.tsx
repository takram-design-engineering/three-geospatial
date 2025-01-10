import { OrbitControls, ScreenQuad } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { type StoryFn } from '@storybook/react'
import { useEffect, useMemo, type FC } from 'react'
import { GLSL3, ShaderMaterial, Uniform, Vector2 } from 'three'

import { CloudShapeDetail } from '@takram/three-global-clouds'

import { useControls } from '../helpers/useControls'

const Scene: FC = () => {
  const shapeDetail = useMemo(() => new CloudShapeDetail(), [])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        glslVersion: GLSL3,
        vertexShader,
        fragmentShader,
        uniforms: {
          resolution: new Uniform(new Vector2()),
          size: new Uniform(shapeDetail.size),
          columns: new Uniform(0),
          shapeDetail: new Uniform(shapeDetail.texture),
          gammaCorrect: new Uniform(false)
        }
      }),
    [shapeDetail]
  )

  const { gl } = useThree()
  useEffect(() => {
    shapeDetail.update(gl)
  }, [shapeDetail, gl])

  const { gammaCorrect } = useControls({
    gammaCorrect: false
  })

  useFrame(({ size }) => {
    material.uniforms.resolution.value.set(size.width, size.height)
    material.uniforms.columns.value = Math.floor(size.width / shapeDetail.size)
    material.uniforms.gammaCorrect.value = gammaCorrect
  })

  return (
    <>
      <OrbitControls />
      <ScreenQuad material={material} />
    </>
  )
}

const Story: StoryFn = () => (
  <Canvas>
    <Scene />
  </Canvas>
)

export default Story

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
  uniform sampler3D shapeDetail;
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
    vec3 uvw = vec3(uv, (float(index)) / size);
    vec4 color = vec4(vec3(texture(shapeDetail, uvw).r), 1.0);
    outputColor = gammaCorrect ? linearToOutputTexel(color) : color;
  }
`
