import { GizmoHelper, GizmoViewport, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, SMAA, ToneMapping } from '@react-three/postprocessing'
import { type StoryFn } from '@storybook/react'
import { useControls } from 'leva'
import { ToneMappingMode } from 'postprocessing'
import { useEffect, useMemo, useRef, type ComponentRef, type FC } from 'react'
import { Quaternion, Vector3 } from 'three'

import { getMoonDirectionECEF, getSunDirectionECEF } from '@geovanni/atmosphere'
import { Sky, type SkyImpl } from '@geovanni/atmosphere/react'
import { Ellipsoid, Geodetic, radians } from '@geovanni/core'
import { Dithering, LensFlare } from '@geovanni/effects/react'

import { Stats } from '../helpers/Stats'
import { useLocalDateControls } from '../helpers/useLocalDateControls'
import { useRendererControls } from '../helpers/useRendererControls'

const location = new Geodetic()
const position = new Vector3()
const up = new Vector3()
const offset = new Vector3()
const rotation = new Quaternion()

const Scene: FC = () => {
  useRendererControls({ exposure: 10 })

  const { longitude, latitude, height } = useControls('location', {
    longitude: { value: 0, min: -180, max: 180 },
    latitude: { value: 35, min: -90, max: 90 },
    height: { value: 2000, min: 0, max: 30000 }
  })

  const camera = useThree(({ camera }) => camera)
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null)
  useEffect(() => {
    const controls = controlsRef.current
    if (controls == null) {
      return
    }
    location.set(radians(longitude), radians(latitude), height)
    location.toECEF(position)
    Ellipsoid.WGS84.getSurfaceNormal(position, up)

    rotation.setFromUnitVectors(camera.up, up)
    offset.copy(camera.position).sub(controls.target)
    offset.applyQuaternion(rotation)
    camera.up.copy(up)
    camera.position.copy(position).add(offset)
    controls.target.copy(position)
  }, [longitude, latitude, height, camera])

  const { osculateEllipsoid, photometric } = useControls('atmosphere', {
    osculateEllipsoid: true,
    photometric: false
  })

  const motionDate = useLocalDateControls({
    longitude,
    dayOfYear: 0
  })
  const sunDirectionRef = useRef(new Vector3())
  const moonDirectionRef = useRef(new Vector3())
  const skyRef = useRef<SkyImpl>(null)

  useFrame(() => {
    const date = new Date(motionDate.get())
    getSunDirectionECEF(date, sunDirectionRef.current)
    getMoonDirectionECEF(date, moonDirectionRef.current)
    if (skyRef.current != null) {
      skyRef.current.material.sunDirection.copy(sunDirectionRef.current)
      skyRef.current.material.moonDirection.copy(moonDirectionRef.current)
    }
  })

  const effectComposer = useMemo(
    () => (
      <EffectComposer key={Math.random()} multisampling={0}>
        <LensFlare />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <SMAA />
        <Dithering />
      </EffectComposer>
    ),
    []
  )

  return (
    <>
      <OrbitControls ref={controlsRef} minDistance={5} />
      <GizmoHelper alignment='top-left' renderPriority={2}>
        <GizmoViewport />
      </GizmoHelper>
      <Sky
        ref={skyRef}
        osculateEllipsoid={osculateEllipsoid}
        photometric={photometric}
      />
      {effectComposer}
    </>
  )
}

export const Basic: StoryFn = () => (
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
