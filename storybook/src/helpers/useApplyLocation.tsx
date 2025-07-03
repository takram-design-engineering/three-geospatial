import { useThree } from '@react-three/fiber'
import { useEffect, useRef, type RefObject } from 'react'
import { Quaternion, Vector3, type Camera } from 'three'
import type { OrbitControls } from 'three-stdlib'

import {
  Ellipsoid,
  Geodetic,
  radians,
  type GeodeticLike
} from '@takram/three-geospatial'

const geodetic = new Geodetic()
const position = new Vector3()
const up = new Vector3()
const offset = new Vector3()
const rotation = new Quaternion()

function applyLocation(
  camera: Camera,
  controls: OrbitControls,
  { longitude, latitude, height }: GeodeticLike
): void {
  geodetic.set(radians(longitude), radians(latitude), height)
  geodetic.toECEF(position)
  Ellipsoid.WGS84.getSurfaceNormal(position, up)

  rotation.setFromUnitVectors(camera.up, up)
  offset.copy(camera.position).sub(controls.target)
  offset.applyQuaternion(rotation)
  camera.up.copy(up)
  camera.position.copy(position).add(offset)
  controls.target.copy(position)
}

export type UseApplyLocationResult = RefObject<OrbitControls | null>

export function useApplyLocation(
  { longitude, latitude, height }: GeodeticLike,
  callback?: (position: Vector3) => void
): UseApplyLocationResult {
  const ref = useRef<OrbitControls>(null)
  const camera = useThree(({ camera }) => camera)
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    const controls = ref.current
    if (controls != null) {
      applyLocation(camera, controls, {
        longitude,
        latitude,
        height
      })
      callbackRef.current?.(position)
    }
  }, [longitude, latitude, height, callback, camera])

  return ref
}
