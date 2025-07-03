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
import {
  Matrix4,
  Raycaster,
  Vector2,
  Vector3,
  type ArrowHelper,
  type Mesh
} from 'three'

import { Ellipsoid } from '@takram/three-geospatial'
import { EllipsoidMesh } from '@takram/three-geospatial/r3f'

const ellipsoid = new Ellipsoid(10, 10, 9)
const raycaster = new Raycaster()
const pointer = new Vector2()
const matrix = new Matrix4()
const east = new Vector3()
const north = new Vector3()
const up = new Vector3()

const Scene: FC = () => {
  const { camera } = useThree()
  const ellipsoidMeshRef = useRef<Mesh>(null)
  const pointMeshRef = useRef<Mesh>(null)
  const eastArrowRef = useRef<ArrowHelper>(null)
  const northArrowRef = useRef<ArrowHelper>(null)
  const upArrowRef = useRef<ArrowHelper>(null)

  useEffect(() => {
    ;[
      eastArrowRef.current!,
      northArrowRef.current!,
      upArrowRef.current!
    ].forEach((arrow, index) => {
      arrow.setColor(['red', 'green', 'blue'][index])
      arrow.setLength(1, 0.2, 0.2)
    })
  }, [])

  useEvent('mousemove', (event: MouseEvent) => {
    const ellipsoidMesh = ellipsoidMeshRef.current!
    const pointMesh = pointMeshRef.current!
    const eastArrow = eastArrowRef.current!
    const northArrow = northArrowRef.current!
    const upArrow = upArrowRef.current!

    pointer.x = (event.clientX / window.innerWidth) * 2 - 1
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1

    raycaster.setFromCamera(pointer, camera)
    const [intersection] = raycaster.intersectObjects([ellipsoidMesh])
    if (intersection == null) {
      return
    }
    const position = intersection.point
    ellipsoid.getEastNorthUpFrame(position, matrix)
    pointMesh.position.copy(position)
    eastArrow.position.copy(position)
    northArrow.position.copy(position)
    upArrow.position.copy(position)
    matrix.extractBasis(east, north, up)
    eastArrow.setDirection(east)
    northArrow.setDirection(north)
    upArrow.setDirection(up)
  })

  return (
    <>
      <GizmoHelper alignment='top-left'>
        <GizmoViewport />
      </GizmoHelper>
      <OrbitControls />
      <ambientLight />
      <directionalLight />
      <EllipsoidMesh ref={ellipsoidMeshRef} args={[ellipsoid.radii, 90, 45]}>
        <meshBasicMaterial color='yellow' wireframe />
      </EllipsoidMesh>
      <Sphere ref={pointMeshRef} args={[0.1]}>
        <meshBasicMaterial color='red' />
      </Sphere>
      <arrowHelper ref={eastArrowRef} />
      <arrowHelper ref={northArrowRef} />
      <arrowHelper ref={upArrowRef} />
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
