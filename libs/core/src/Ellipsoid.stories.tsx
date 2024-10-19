/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { OrbitControls, Sphere } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { type Meta, type StoryFn } from '@storybook/react'
import { useControls } from 'leva'
import { useEffect, useRef, type FC } from 'react'
import { useEvent } from 'react-use'
import { Raycaster, Vector2, Vector3, type ArrowHelper, type Mesh } from 'three'

import { Ellipsoid } from './Ellipsoid'
import { projectToGeodeticSurface } from './projectToGeodeticSurface'

export default {
  title: 'core/Ellipsoid',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getHeightAdjustment(
  radius: number,
  geodeticSurface: Vector3,
  result = new Vector3()
): Vector3 {
  const surfaceRadius = geodeticSurface.length()
  const offset = surfaceRadius - radius
  return result.copy(geodeticSurface).normalize().multiplyScalar(offset)
}

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
    projectToGeodeticSurface(
      intersection.point,
      ellipsoid.reciprocalRadiiSquared(),
      undefined,
      position
    )
    pointMesh.position.copy(position)
    normalArrow.position.copy(position)
    normalArrow.setDirection(ellipsoid.getSurfaceNormal(position)!)

    const radius = (ellipsoid.minimumRadius + ellipsoid.maximumRadius) / 2
    // sphereMesh.scale.set(radius, radius, radius)
    // getHeightAdjustment(radius, position, sphereMesh.position)
    ellipsoid.getOsculatingSphereCenter(position, radius, sphereMesh.position)
    sphereMesh.scale.set(radius, radius, radius)
  })

  return (
    <>
      <OrbitControls />
      <Sphere
        ref={ellipsoidMeshRef}
        args={[ellipsoid.minimumRadius, 90, 45]}
        scale={[
          ellipsoid.radii.x / ellipsoid.minimumRadius,
          ellipsoid.radii.z / ellipsoid.minimumRadius,
          ellipsoid.radii.y / ellipsoid.minimumRadius
        ]}
        rotation-x={Math.PI / 2}
      >
        <meshBasicMaterial color='yellow' wireframe={wireframe} />
      </Sphere>
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

export const OsculatingSphere: StoryFn = () => {
  return (
    <Canvas camera={{ fov: 30, position: [50, 0, 0], up: [0, 0, 1] }}>
      <Scene />
    </Canvas>
  )
}
