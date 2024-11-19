import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, ToneMapping } from '@react-three/postprocessing'
import { type StoryFn } from '@storybook/react'
import { ToneMappingMode } from 'postprocessing'
import { useEffect, useRef, type FC } from 'react'
import { Quaternion, Vector3, type Camera } from 'three'
import { type OrbitControls as OrbitControlsImpl } from 'three-stdlib'

import { Atmosphere, Sky, type AtmosphereApi } from '@geovanni/atmosphere/react'
import { Ellipsoid, Geodetic, radians, type GeodeticLike } from '@geovanni/core'
import { Dithering, LensFlare } from '@geovanni/effects/react'

import { Stats } from '../helpers/Stats'
import { useControls } from '../helpers/useControls'
import { useLocalDateControls } from '../helpers/useLocalDateControls'
import { useLocationControls } from '../helpers/useLocationControls'
import { useRendererControls } from '../helpers/useRendererControls'

const location = new Geodetic()
const position = new Vector3()
const up = new Vector3()
const offset = new Vector3()
const rotation = new Quaternion()

function applyLocation(
  camera: Camera,
  controls: OrbitControlsImpl,
  { longitude, latitude, height }: GeodeticLike
): void {
  location.set(radians(longitude), radians(latitude), height)
  location.toECEF(position)
  Ellipsoid.WGS84.getSurfaceNormal(position, up)

  rotation.setFromUnitVectors(camera.up, up)
  offset.copy(camera.position).sub(controls.target)
  offset.applyQuaternion(rotation)
  camera.up.copy(up)
  camera.position.copy(position).add(offset)
  controls.target.copy(position)
}

const Scene: FC = () => {
  useRendererControls({ exposure: 10 })
  const { longitude, latitude, height } = useLocationControls()
  const motionDate = useLocalDateControls({
    longitude,
    dayOfYear: 0
  })
  const { osculateEllipsoid, photometric } = useControls('atmosphere', {
    osculateEllipsoid: true,
    photometric: false
  })

  const camera = useThree(({ camera }) => camera)
  const controlsRef = useRef<OrbitControlsImpl>(null)
  useEffect(() => {
    const controls = controlsRef.current
    if (controls != null) {
      applyLocation(camera, controls, {
        longitude,
        latitude,
        height
      })
    }
  }, [longitude, latitude, height, camera])

  const atmosphereRef = useRef<AtmosphereApi>(null)
  useFrame(() => {
    atmosphereRef.current?.update(new Date(motionDate.get()))
  })

  return (
    <>
      <OrbitControls ref={controlsRef} minDistance={5} />
      <Atmosphere
        ref={atmosphereRef}
        texturesUrl='/'
        osculateEllipsoid={osculateEllipsoid}
        photometric={photometric}
      >
        <Sky />
      </Atmosphere>
      <EffectComposer multisampling={0}>
        <LensFlare />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <Dithering />
      </EffectComposer>
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
  >
    <Stats />
    <Scene />
  </Canvas>
)

export default Story
