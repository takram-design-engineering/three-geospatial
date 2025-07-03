import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { EffectComposer, ToneMapping } from '@react-three/postprocessing'
import type { StoryFn } from '@storybook/react-vite'
import { useRef, type FC } from 'react'

import {
  Atmosphere,
  Sky,
  type AtmosphereApi
} from '@takram/three-atmosphere/r3f'
import { Dithering, LensFlare } from '@takram/three-geospatial-effects/r3f'

import { Stats } from '../helpers/Stats'
import { useApplyLocation } from '../helpers/useApplyLocation'
import { useControls } from '../helpers/useControls'
import { useLocalDateControls } from '../helpers/useLocalDateControls'
import { useLocationControls } from '../helpers/useLocationControls'
import { useToneMappingControls } from '../helpers/useToneMappingControls'

const Scene: FC = () => {
  const { toneMappingMode } = useToneMappingControls({ exposure: 10 })
  const { longitude, latitude, height } = useLocationControls()
  const motionDate = useLocalDateControls({ longitude, dayOfYear: 0 })
  const { correctAltitude } = useControls('atmosphere', {
    correctAltitude: true
  })

  const controlsRef = useApplyLocation({ longitude, latitude, height })
  const atmosphereRef = useRef<AtmosphereApi>(null)
  useFrame(() => {
    atmosphereRef.current?.updateByDate(new Date(motionDate.get()))
  })

  return (
    <>
      <OrbitControls ref={controlsRef} minDistance={5} />
      <Atmosphere ref={atmosphereRef} correctAltitude={correctAltitude}>
        <Sky />
      </Atmosphere>
      <EffectComposer multisampling={0}>
        <LensFlare />
        <ToneMapping mode={toneMappingMode} />
        <Dithering />
      </EffectComposer>
    </>
  )
}

const Story: StoryFn = () => (
  <Canvas gl={{ depth: false }}>
    <Stats />
    <Scene />
  </Canvas>
)

export default Story
