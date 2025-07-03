import { Box, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { EffectComposer, SMAA, ToneMapping } from '@react-three/postprocessing'
import type { StoryFn } from '@storybook/react-vite'
import { Fragment, useRef, useState, type FC } from 'react'

import {
  AerialPerspective,
  Atmosphere,
  type AtmosphereApi
} from '@takram/three-atmosphere/r3f'
import type { CloudsEffect } from '@takram/three-clouds'
import { Clouds } from '@takram/three-clouds/r3f'
import { radians } from '@takram/three-geospatial'
import { Dithering, LensFlare } from '@takram/three-geospatial-effects/r3f'
import { EastNorthUpFrame } from '@takram/three-geospatial/r3f'

import { Stats } from '../helpers/Stats'
import { useApplyLocation } from '../helpers/useApplyLocation'
import { useControls } from '../helpers/useControls'
import { useLocalDateControls } from '../helpers/useLocalDateControls'
import { useLocationControls } from '../helpers/useLocationControls'
import { useToneMappingControls } from '../helpers/useToneMappingControls'
import { useCloudsControls } from './helpers/useCloudsControls'

const Scene: FC = () => {
  const { toneMappingMode } = useToneMappingControls({ exposure: 10 })
  const { longitude, latitude, height } = useLocationControls(
    {
      longitude: 30,
      height: 300
    },
    { collapsed: true }
  )
  const motionDate = useLocalDateControls({ longitude, dayOfYear: 0 })
  const { correctAltitude } = useControls(
    'atmosphere',
    { correctAltitude: true },
    { collapsed: true }
  )

  const controlsRef = useApplyLocation({ longitude, latitude, height })
  const atmosphereRef = useRef<AtmosphereApi>(null)
  useFrame(() => {
    atmosphereRef.current?.updateByDate(new Date(motionDate.get()))
  })

  const [clouds, setClouds] = useState<CloudsEffect | null>(null)
  const [{ enabled, toneMapping }, cloudsProps] = useCloudsControls(clouds)

  const { showBox: debugShowBox } = useControls(
    'debug',
    { showBox: false },
    { collapsed: true }
  )

  return (
    <>
      <OrbitControls ref={controlsRef} minDistance={1000} />
      {debugShowBox && (
        <EastNorthUpFrame
          longitude={radians(longitude)}
          latitude={radians(latitude)}
        >
          <Box
            args={[2e3, 2e3, 2e3]}
            position={[1e3, -2e3, 1e3]}
            rotation={[Math.PI / 4, Math.PI / 4, 0]}
          >
            <meshBasicMaterial color='white' />
          </Box>
        </EastNorthUpFrame>
      )}
      <Atmosphere ref={atmosphereRef} correctAltitude={correctAltitude}>
        <EffectComposer multisampling={0} enableNormalPass>
          <Fragment key={JSON.stringify([enabled, toneMapping])}>
            {enabled && (
              <Clouds ref={setClouds} shadow-maxFar={1e5} {...cloudsProps} />
            )}
            <AerialPerspective sky sunLight skyLight />
            {toneMapping && (
              <>
                <LensFlare />
                <ToneMapping mode={toneMappingMode} />
                <SMAA />
                <Dithering />
              </>
            )}
          </Fragment>
        </EffectComposer>
      </Atmosphere>
    </>
  )
}

const Story: StoryFn = () => (
  <Canvas gl={{ depth: false }} camera={{ near: 1, far: 4e5 }}>
    <Stats />
    <Scene />
  </Canvas>
)

export default Story
