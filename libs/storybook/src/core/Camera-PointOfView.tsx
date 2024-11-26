/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { GizmoHelper, GizmoViewport, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { type StoryFn } from '@storybook/react'
import { useEffect, useState, type ComponentRef, type FC } from 'react'

import {
  Ellipsoid,
  Geodetic,
  PointOfView,
  radians
} from '@takram/three-geospatial'
import { EllipsoidMesh } from '@takram/three-geospatial/r3f'

import { useControls } from '../helpers/useControls'

const geodeticScratch = new Geodetic()

const Scene: FC = () => {
  const { camera } = useThree()

  const [controls, setControls] = useState<ComponentRef<
    typeof OrbitControls
  > | null>(null)

  const { longitude, latitude, heading, pitch, distance } = useControls({
    longitude: { value: 0, min: -180, max: 180 },
    latitude: { value: 0, min: -90, max: 90 },
    heading: { value: -90, min: -180, max: 180 },
    pitch: { value: -45, min: -90, max: 90 },
    distance: { value: 1000, min: 0, max: 1000 }
  })

  useEffect(() => {
    const pov = new PointOfView()
    geodeticScratch
      .set(radians(longitude), radians(latitude))
      .toECEF(pov.target)
    pov.heading = radians(heading)
    pov.pitch = radians(pitch)
    pov.distance = distance * 1e3
    pov.decompose(camera.position, camera.quaternion)

    if (controls != null) {
      controls.target.copy(pov.target)
      controls.update()
    }
  }, [longitude, latitude, heading, pitch, distance, camera, controls])

  useFrame(() => {
    if (controls != null) {
      camera.up.copy(Ellipsoid.WGS84.getSurfaceNormal(controls.target))
      controls.update()
    }
  })

  return (
    <>
      <GizmoHelper alignment='top-left'>
        <GizmoViewport />
      </GizmoHelper>
      <OrbitControls ref={setControls} enablePan={false} />
      <EllipsoidMesh args={[Ellipsoid.WGS84.radii, 200, 100]}>
        <meshBasicMaterial color='gray' wireframe />
      </EllipsoidMesh>
    </>
  )
}

const Story: StoryFn = () => {
  return (
    <Canvas
      gl={{ logarithmicDepthBuffer: true }}
      camera={{
        near: 1,
        far: 1e8
      }}
    >
      <Scene />
    </Canvas>
  )
}

export default Story
