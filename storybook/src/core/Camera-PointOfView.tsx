import { GizmoHelper, GizmoViewport, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import type { StoryFn } from '@storybook/react-vite'
import { useEffect, useState, type ComponentRef, type FC } from 'react'
import { Vector3 } from 'three'

import {
  Ellipsoid,
  Geodetic,
  PointOfView,
  radians
} from '@takram/three-geospatial'
import { EllipsoidMesh } from '@takram/three-geospatial/r3f'

import { useControls } from '../helpers/useControls'

const geodeticScratch = new Geodetic()
const vectorScratch = new Vector3()

const Scene: FC = () => {
  const { enableControls } = useControls({
    enableControls: false
  })
  const { camera } = useThree()

  const [controls, setControls] = useState<ComponentRef<
    typeof OrbitControls
  > | null>(null)

  const { longitude, latitude, heading, distance, pitch, roll } = useControls({
    longitude: { value: 90, min: -180, max: 180 },
    latitude: { value: 40, min: -90, max: 90 },
    distance: { value: 1000, min: 0, max: 1000 },
    heading: { value: -90, min: -180, max: 180 },
    pitch: { value: -45, min: -90, max: 90 },
    roll: { value: 0, min: -180, max: 180 }
  })

  useEffect(() => {
    const pov = new PointOfView()
    const target = geodeticScratch
      .set(radians(longitude), radians(latitude))
      .toECEF(vectorScratch)
    pov.distance = distance * 1e3
    pov.heading = radians(heading)
    pov.pitch = radians(pitch)
    pov.roll = radians(roll)
    pov.decompose(target, camera.position, camera.quaternion, camera.up)

    if (controls != null) {
      controls.target.copy(target)
      // TODO: This resets roll.
      controls.update()
    }
  }, [longitude, latitude, distance, heading, pitch, roll, camera, controls])

  useFrame(() => {
    if (controls != null) {
      controls.update()
    }
  })

  return (
    <>
      <GizmoHelper alignment='top-left'>
        <GizmoViewport />
      </GizmoHelper>
      {enableControls && <OrbitControls ref={setControls} enablePan={false} />}
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
      camera={{ near: 1, far: 1e8 }}
    >
      <Scene />
    </Canvas>
  )
}

export default Story
