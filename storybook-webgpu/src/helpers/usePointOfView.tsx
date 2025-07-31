import { useThree } from '@react-three/fiber'
import { useLayoutEffect } from 'react'

import { Geodetic, PointOfView, radians } from '@takram/three-geospatial'

export interface PointOfViewProps {
  longitude: number
  latitude: number
  height?: number
  heading: number
  pitch: number
  distance: number
}

export function usePointOfView({
  longitude,
  latitude,
  height = 0,
  heading,
  pitch,
  distance
}: PointOfViewProps): void {
  const camera = useThree(({ camera }) => camera)
  useLayoutEffect(() => {
    new PointOfView(distance, radians(heading), radians(pitch)).decompose(
      new Geodetic(radians(longitude), radians(latitude), height).toECEF(),
      camera.position,
      camera.quaternion,
      camera.up
    )
  }, [longitude, latitude, height, heading, pitch, distance, camera])
}
