import { OrbitControls, ScreenQuad } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { type StoryFn } from '@storybook/react'
import { useEffect, useMemo, type FC } from 'react'
import { GLSL3, ShaderMaterial, Uniform, Vector2 } from 'three'

import { Turbulence } from '@takram/three-clouds'

import { useControls } from '../helpers/useControls'

const Scene: FC = () => {
  const turbulence = useMemo(() => new Turbulence(), [])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        glslVersion: GLSL3,
        vertexShader,
        fragmentShader,
        uniforms: {
          resolution: new Uniform(new Vector2()),
          size: new Uniform(new Vector2().setScalar(turbulence.size * 2)),
          turbulence: new Uniform(turbulence.texture),
          gammaCorrect: new Uniform(false)
        }
      }),
    [turbulence]
  )

  const { gl } = useThree()
  useEffect(() => {
    turbulence.render(gl)
  }, [turbulence, gl])

  const { gammaCorrect } = useControls({
    gammaCorrect: false
  })

  useFrame(({ size }) => {
    material.uniforms.resolution.value.set(size.width, size.height)
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

  in vec2 vUv;

  out vec4 outputColor;

  uniform vec2 resolution;
  uniform vec2 size;
  uniform sampler2D turbulence;
  uniform bool gammaCorrect;

  void main() {
    vec2 scale = resolution / size;
    vec2 uv = vUv * scale + (1.0 - scale) * 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      discard;
    }

    vec4 coord = vec4(uv, uv - 0.5) * 2.0;
    vec4 color;
    if (uv.y > 0.5) {
      if (uv.x < 0.5) {
        color = vec4(vec3(texture(turbulence, coord.xw).r), 1.0);
      } else {
        color = vec4(vec3(texture(turbulence, coord.zw).g), 1.0);
      }
    } else {
      if (uv.x < 0.5) {
        color = vec4(vec3(texture(turbulence, coord.xy).b), 1.0);
      } else {
        color = vec4(vec3(texture(turbulence, coord.zy).a), 1.0);
      }
    }
    outputColor = gammaCorrect ? linearToOutputTexel(color) : color;
  }
`
