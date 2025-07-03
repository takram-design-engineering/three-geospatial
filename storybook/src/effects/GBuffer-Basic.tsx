import { OrbitControls, Sphere } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { ToneMapping } from '@react-three/postprocessing'
import type { StoryFn } from '@storybook/react-vite'
import { useMemo, type FC } from 'react'

import {
  Depth,
  EffectComposer,
  Geometry
} from '@takram/three-geospatial-effects/r3f'

import { useControls } from '../helpers/useControls'

const Scene: FC = () => {
  const { output, material, depth } = useControls({
    output: {
      value: 'normal' as const,
      options: ['render', 'normal', 'pbr'] as const
    },
    material: {
      value: 'physical' as const,
      options: ['basic', 'lambert', 'phong', 'standard', 'physical'] as const
    },
    depth: false
  })

  const effectComposer = useMemo(
    () => (
      <EffectComposer key={Math.random()}>
        {output !== 'render' && <Geometry output={output} />}
        {depth && <Depth useTurbo />}
        {output === 'render' && !depth && <ToneMapping />}
      </EffectComposer>
    ),
    [output, depth]
  )

  const Material = (
    {
      basic: 'meshBasicMaterial',
      lambert: 'meshLambertMaterial',
      phong: 'meshPhongMaterial',
      standard: 'meshStandardMaterial',
      physical: 'meshPhysicalMaterial'
    } as const
  )[material]

  return (
    <>
      <OrbitControls />
      <ambientLight />
      <directionalLight position={[1, 1, 1]} />
      {effectComposer}
      {[...Array(10)].map((_, x, { length }) => {
        const n = length - 1
        return [...Array(10)].map((_, y, { length }) => {
          const m = length - 1
          return (
            <Sphere
              key={`${x}:${y}`}
              args={[0.15]}
              position={[(x - n / 2) * 0.5, (y - m / 2) * 0.5, 0]}
            >
              <Material
                color='white'
                metalness={x / n}
                roughness={y / m}
                // TODO: reflectivity is assigned to uniforms only when envMap
                // is defined. Need to do so in onBeforeCompile manually.
                // https://github.com/mrdoob/three.js/blob/r169/src/renderers/webgl/WebGLMaterials.js#L243
                reflectivity={x / n}
              />
            </Sphere>
          )
        })
      })}
    </>
  )
}

const Story: StoryFn = () => {
  return (
    <Canvas gl={{ depth: false }}>
      <Scene />
    </Canvas>
  )
}

export default Story
