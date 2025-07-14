import {
  GizmoHelper,
  GizmoViewport,
  OrbitControls,
  Sphere
} from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { SMAA, ToneMapping } from '@react-three/postprocessing'
import type { StoryFn } from '@storybook/react-vite'
import { Fragment, useState, type FC } from 'react'
import { Vector3 } from 'three'

import {
  AerialPerspective,
  Atmosphere,
  Sky,
  SkyLight,
  Stars,
  SunLight,
  type AtmosphereApi
} from '@takram/three-atmosphere/r3f'
import type { CloudsEffect } from '@takram/three-clouds'
import { Clouds } from '@takram/three-clouds/r3f'
import { Ellipsoid, Geodetic, radians } from '@takram/three-geospatial'
import { Dithering, LensFlare } from '@takram/three-geospatial-effects/r3f'

import { EffectComposer } from '../helpers/EffectComposer'
import { Stats } from '../helpers/Stats'
import { useControls } from '../helpers/useControls'
import { useLocalDateControls } from '../helpers/useLocalDateControls'
import { useLocationControls } from '../helpers/useLocationControls'
import { useToneMappingControls } from '../helpers/useToneMappingControls'
import { useCloudsControls } from './helpers/useCloudsControls'

const geodetic = new Geodetic()
const position = new Vector3()

const Scene: FC = () => {
  const { toneMappingMode } = useToneMappingControls({ exposure: 10 })
  const { longitude, latitude, height } = useLocationControls({
    longitude: 30,
    height: 300
  })
  const motionDate = useLocalDateControls({ longitude, dayOfYear: 0 })
  const { correctAltitude } = useControls(
    'atmosphere',
    { correctAltitude: true },
    { collapsed: true }
  )

  const [atmosphere, setAtmosphere] = useState<AtmosphereApi | null>(null)
  useFrame(() => {
    if (atmosphere == null) {
      return
    }
    atmosphere.updateByDate(new Date(motionDate.get()))

    geodetic.set(radians(longitude), radians(latitude), height)
    Ellipsoid.WGS84.getNorthUpEastFrame(
      geodetic.toECEF(position),
      atmosphere.worldToECEFMatrix
    )
  })

  const [clouds, setClouds] = useState<CloudsEffect | null>(null)
  const [{ enabled, toneMapping }, cloudsProps] = useCloudsControls(clouds)

  return (
    <>
      <GizmoHelper alignment='top-left' renderPriority={2}>
        <GizmoViewport />
      </GizmoHelper>
      <OrbitControls target={[0, 0.5, 0]} minDistance={1} />
      <Sphere args={[0.5, 128, 128]} position={[0, 0.5, 0]}>
        <meshStandardMaterial color='white' />
      </Sphere>
      {/* <Grid
        cellColor={0x333333}
        sectionColor={0x333333}
        fadeStrength={10}
        fadeDistance={100}
        followCamera
        infiniteGrid
      /> */}
      <Atmosphere ref={setAtmosphere} correctAltitude={correctAltitude}>
        <Sky />
        <SkyLight />
        <SunLight />
        <Stars data='atmosphere/stars.bin' />
        <EffectComposer multisampling={0}>
          <Fragment key={JSON.stringify([enabled, toneMapping])}>
            {enabled && (
              <Clouds ref={setClouds} shadow-maxFar={1e5} {...cloudsProps} />
            )}
            <AerialPerspective />
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
  <Canvas
    gl={{ depth: false }}
    camera={{
      position: [2, 1, 2],
      near: 0.1,
      far: 1e5
    }}
  >
    <Stats />
    <Scene />
  </Canvas>
)

export default Story
