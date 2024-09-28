import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { useMemo, type FC } from 'react'

import { Cartographic, Ellipsoid } from '@geovanni/core'

export const Camera: FC<{
  location: Cartographic
}> = ({ location }) => {
  const position = useMemo(() => location.toVector(), [location])
  const target = useMemo(
    () => new Cartographic().copy(location).setHeight(0).toVector(),
    [location]
  )
  const normal = useMemo(
    () => Ellipsoid.WGS84.geodeticSurfaceNormal(target),
    [target]
  )
  return (
    <>
      <PerspectiveCamera
        makeDefault
        near={1}
        far={1e8}
        position={position}
        up={normal}
      />
      <OrbitControls target={target} />
    </>
  )
}
