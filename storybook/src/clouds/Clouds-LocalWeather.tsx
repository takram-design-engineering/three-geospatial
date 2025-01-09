import { OrbitControls, ScreenQuad } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { type StoryFn } from '@storybook/react'
import { useEffect, useMemo, type FC } from 'react'
import { GLSL3, ShaderMaterial, Uniform } from 'three'

import { LocalWeather } from '@takram/three-global-clouds'

const Scene: FC = () => {
  const localWeather = useMemo(() => new LocalWeather(), [])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        glslVersion: GLSL3,
        vertexShader,
        fragmentShader,
        uniforms: {
          localWeather: new Uniform(localWeather.texture)
        }
      }),
    [localWeather]
  )

  const { gl } = useThree()
  useEffect(() => {
    localWeather.update(gl)
  }, [localWeather, gl])

  return (
    <>
      <OrbitControls />
      <ScreenQuad material={material} />
    </>
  )
}

const Story: StoryFn = () => (
  <div
    style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}
  >
    <div
      style={{
        aspectRatio: 1,
        width: '100%',
        maxWidth: 1024,
        maxHeight: 1024
      }}
    >
      <Canvas>
        <Scene />
      </Canvas>
    </div>
  </div>
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

  uniform sampler2D localWeather;

  void main() {
    vec4 coord = vec4(vUv, vUv - 0.5) * 2.0;
    vec4 color;
    if (vUv.y > 0.5) {
      if (vUv.x < 0.5) {
        color = vec4(vec3(texture(localWeather, coord.xw).r), 1.0);
      } else {
        color = vec4(vec3(texture(localWeather, coord.zw).g), 1.0);
      }
    } else {
      if (vUv.x < 0.5) {
        color = vec4(vec3(texture(localWeather, coord.xy).b), 1.0);
      } else {
        color = vec4(vec3(texture(localWeather, coord.zy).a), 1.0);
      }
    }
    outputColor = linearToOutputTexel(color);
  }
`
