/* eslint-disable @typescript-eslint/no-non-null-assertion */

import {
  GizmoHelper,
  GizmoViewport,
  OrbitControls,
  Sphere
} from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import type { StoryFn } from '@storybook/react-vite'
import { useEffect, useRef, type FC } from 'react'
import { useEvent } from 'react-use'
import { Raycaster, Vector2, Vector3, type ArrowHelper, type Mesh } from 'three'

import { Ellipsoid } from '@takram/three-geospatial'
import { EllipsoidMesh } from '@takram/three-geospatial/r3f'

import { useControls } from '../helpers/useControls'

const ellipsoid = new Ellipsoid(10, 10, 9)
const raycaster = new Raycaster()
const pointer = new Vector2()
const position = new Vector3()

const Scene: FC = () => {
  const { wireframe } = useControls({ wireframe: true })

  const { camera } = useThree()
  const ellipsoidMeshRef = useRef<Mesh>(null)
  const sphereMeshRef = useRef<Mesh>(null)
  const pointMeshRef = useRef<Mesh>(null)
  const normalArrowRef = useRef<ArrowHelper>(null)

  useEffect(() => {
    const normalArrow = normalArrowRef.current!
    normalArrow.setColor('red')
    normalArrow.setLength(1, 0.2, 0.2)
  }, [])

  useEvent('mousemove', (event: MouseEvent) => {
    const ellipsoidMesh = ellipsoidMeshRef.current!
    const sphereMesh = sphereMeshRef.current!
    const pointMesh = pointMeshRef.current!
    const normalArrow = normalArrowRef.current!

    pointer.x = (event.clientX / window.innerWidth) * 2 - 1
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1

    raycaster.setFromCamera(pointer, camera)
    const [intersection] = raycaster.intersectObjects([ellipsoidMesh])
    if (intersection == null) {
      return
    }
    ellipsoid.projectOnSurface(intersection.point, position)
    pointMesh.position.copy(position)
    normalArrow.position.copy(position)
    normalArrow.setDirection(ellipsoid.getSurfaceNormal(position))

    const radius = (ellipsoid.minimumRadius + ellipsoid.maximumRadius) / 2
    ellipsoid.getOsculatingSphereCenter(position, radius, sphereMesh.position)
    sphereMesh.scale.set(radius, radius, radius)
  })

  return (
    <>
      <GizmoHelper alignment='top-left'>
        <GizmoViewport />
      </GizmoHelper>
      <OrbitControls />
      <EllipsoidMesh ref={ellipsoidMeshRef} args={[ellipsoid.radii, 90, 45]}>
        <meshBasicMaterial color='yellow' wireframe={wireframe} />
      </EllipsoidMesh>
      <Sphere ref={sphereMeshRef} args={[1, 90, 45]} rotation-x={Math.PI / 2}>
        <meshBasicMaterial color='cyan' wireframe={wireframe} />
      </Sphere>
      <Sphere ref={pointMeshRef} args={[0.1]}>
        <meshBasicMaterial color='red' />
      </Sphere>
      <arrowHelper ref={normalArrowRef} />
    </>
  )
}

const Story: StoryFn = () => {
  return (
    <Canvas camera={{ fov: 30, position: [50, 0, 0], up: [0, 0, 1] }}>
      <Scene />
    </Canvas>
  )
}

export default Story
