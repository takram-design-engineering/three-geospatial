import { Environment, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { EffectComposer, ToneMapping } from '@react-three/postprocessing'
import { type Meta, type StoryFn } from '@storybook/react'
import { ToneMappingMode } from 'postprocessing'
import { useMemo, type FC } from 'react'

import { LensFlare } from './LensFlare'

export default {
  title: 'effects/LensFlare',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

const Scene: FC = () => {
  const effectComposer = useMemo(
    () => (
      <EffectComposer key={Math.random()}>
        <LensFlare
          featuresMaterial-ghostAmount={0.1}
          featuresMaterial-haloAmount={0.1}
        />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    ),
    []
  )
  return (
    <>
      <OrbitControls />
      <Environment preset='warehouse' background />
      {effectComposer}
    </>
  )
}

export const Basic: StoryFn = () => {
  return (
    <Canvas
      gl={{
        antialias: false,
        depth: false,
        stencil: false
      }}
    >
      <Scene />
    </Canvas>
  )
}
