import {
  GizmoHelper,
  GizmoViewport,
  Grid,
  OrbitControls,
  Sphere
} from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { ToneMapping } from '@react-three/postprocessing'
import { type StoryFn } from '@storybook/react'
import { ToneMappingMode } from 'postprocessing'
import { useState, type FC } from 'react'
import { DoubleSide, Vector3 } from 'three'

import {
  AerialPerspective,
  Atmosphere,
  Sky,
  SkyLight,
  Stars,
  SunLight,
  type AtmosphereApi
} from '@takram/three-atmosphere/r3f'
import { Ellipsoid, Geodetic, radians } from '@takram/three-geospatial'
import { Dithering, LensFlare } from '@takram/three-geospatial-effects/r3f'

import { EffectComposer } from '../helpers/EffectComposer'
import { Stats } from '../helpers/Stats'
import { useControls } from '../helpers/useControls'
import { useExposureControls } from '../helpers/useExposureControls'
import { useLocalDateControls } from '../helpers/useLocalDateControls'
import { useLocationControls } from '../helpers/useLocationControls'

const geodetic = new Geodetic()
const position = new Vector3()
const east = new Vector3()
const north = new Vector3()
const up = new Vector3()

const Scene: FC = () => {
  useExposureControls({ exposure: 10 })
  const { longitude, latitude, height } = useLocationControls({
    height: 500
  })
  const motionDate = useLocalDateControls({
    longitude,
    dayOfYear: 0
  })
  const { correctAltitude } = useControls('atmosphere', {
    correctAltitude: true
  })

  const [atmosphere, setAtmosphere] = useState<AtmosphereApi | null>(null)
  useFrame(() => {
    if (atmosphere == null) {
      return
    }
    atmosphere.updateByDate(new Date(motionDate.get()))

    // Offset the ellipsoid so that the world space origin locates at the
    // position relative to the ellipsoid.
    geodetic.set(radians(longitude), radians(latitude), height)
    geodetic.toECEF(position)
    atmosphere.ellipsoidCenter.copy(position).multiplyScalar(-1)

    // Rotate the ellipsoid around the world space origin so that the camera's
    // orientation aligns with X: north, Y: up, Z: east, for example.
    Ellipsoid.WGS84.getEastNorthUpVectors(position, east, north, up)
    atmosphere.ellipsoidMatrix.makeBasis(north, up, east).invert()
  })

  return (
    <>
      <GizmoHelper alignment='top-left' renderPriority={2}>
        <GizmoViewport />
      </GizmoHelper>
      <OrbitControls target={[0, 0.5, 0]} minDistance={1} />
      <Sphere args={[0.5, 128, 128]} position={[0, 0.5, 0]}>
        <meshStandardMaterial color='white' />
      </Sphere>
      <Grid
        cellColor={0x333333}
        sectionColor={0x333333}
        fadeStrength={10}
        fadeDistance={100}
        followCamera
        infiniteGrid
        side={DoubleSide}
      />
      <Atmosphere
        ref={setAtmosphere}
        textures='atmosphere'
        correctAltitude={correctAltitude}
      >
        <Sky />
        <SkyLight />
        <SunLight />
        <Stars data='atmosphere/stars.bin' />
        <EffectComposer>
          <AerialPerspective />
          <LensFlare />
          <ToneMapping mode={ToneMappingMode.AGX} />
          <Dithering />
        </EffectComposer>
      </Atmosphere>
    </>
  )
}

const Story: StoryFn = () => (
  <Canvas
    gl={{
      antialias: false,
      depth: false,
      stencil: false
    }}
    camera={{ position: [2, 1, 2] }}
  >
    <Stats />
    <Scene />
  </Canvas>
)

export default Story
