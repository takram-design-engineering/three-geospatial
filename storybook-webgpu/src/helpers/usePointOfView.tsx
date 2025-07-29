import { useThree } from '@react-three/fiber'
import { useLayoutEffect } from 'react'

import { Geodetic, PointOfView, radians } from '@takram/three-geospatial'

export interface PointOfViewProps {
  longitude: number
  latitude: number
  heading: number
  pitch: number
  distance: number
}

export function usePointOfView({
  longitude,
  latitude,
  heading,
  pitch,
  distance
}: PointOfViewProps): void {
  const camera = useThree(({ camera }) => camera)
  useLayoutEffect(() => {
    new PointOfView(distance, radians(heading), radians(pitch)).decompose(
      new Geodetic(radians(longitude), radians(latitude)).toECEF(),
      camera.position,
      camera.quaternion,
      camera.up
    )
  }, [longitude, latitude, heading, pitch, distance, camera])
}
