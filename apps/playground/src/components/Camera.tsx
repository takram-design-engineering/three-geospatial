import { Ellipsoid } from '@math.gl/geospatial'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { useMemo, type FC } from 'react'
import { Vector3 } from 'three'

export const Camera: FC<{
  longitude: number
  latitude: number
  height: number
}> = ({ longitude, latitude, height }) => {
  const position = useMemo(
    () =>
      Ellipsoid.WGS84.cartographicToCartesian([longitude, latitude, height]),
    [longitude, latitude, height]
  )

  const target = useMemo(
    () => Ellipsoid.WGS84.cartographicToCartesian([longitude, latitude, 0]),
    [longitude, latitude]
  )

  const normal = useMemo(
    () => new Vector3(...Ellipsoid.WGS84.geodeticSurfaceNormal(target)),
    [target]
  )

  return (
    <>
      <PerspectiveCamera
        makeDefault
        near={1}
        far={1e5}
        position={position as [number, number, number]}
        up={normal}
      />
      <OrbitControls target={target as [number, number, number]} />
    </>
  )
}
