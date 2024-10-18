import { Environment, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { ToneMapping } from '@react-three/postprocessing'
import { type Meta, type StoryFn } from '@storybook/react'
import { useControls } from 'leva'
import { ToneMappingMode } from 'postprocessing'
import { useMemo, type FC } from 'react'

import { EffectComposer } from './react/EffectComposer'
import { LensFlare } from './react/LensFlare'

export default {
  title: 'effects/LensFlare',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

const Scene: FC = () => {
  const { enabled } = useControls({
    enabled: true
  })

  const effectComposer = useMemo(
    () => (
      <EffectComposer key={Math.random()}>
        {enabled && (
          <LensFlare
            intensity={0.1}
            featuresMaterial-ghostAmount={0.1}
            featuresMaterial-haloAmount={0.1}
          />
        )}
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    ),
    [enabled]
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
