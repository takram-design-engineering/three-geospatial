import { Environment, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { EffectComposer, ToneMapping } from '@react-three/postprocessing'
import type { StoryFn } from '@storybook/react-vite'
import { ToneMappingMode } from 'postprocessing'
import { Fragment, useMemo, type FC } from 'react'

import { LensFlare } from '@takram/three-geospatial-effects/r3f'

import { useControls } from '../helpers/useControls'

const Scene: FC = () => {
  const { enabled } = useControls({
    enabled: true
  })

  return (
    <>
      <OrbitControls />
      <Environment files='public/hdri/wooden_lounge_4k.hdr' background />
      {useMemo(
        () => (
          <EffectComposer>
            <Fragment key={JSON.stringify([enabled])}>
              {enabled && (
                <LensFlare
                  intensity={0.1}
                  featuresMaterial-ghostAmount={0.1}
                  featuresMaterial-haloAmount={0.1}
                />
              )}
              <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
            </Fragment>
          </EffectComposer>
        ),
        [enabled]
      )}
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
