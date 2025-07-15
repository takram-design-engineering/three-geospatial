import { Vector3 } from 'three'

import type { Ellipsoid } from '@takram/three-geospatial'

const vectorScratch = /*#__PURE__*/ new Vector3()

export function getAltitudeCorrectionOffset(
  cameraPosition: Vector3,
  bottomRadius: number,
  ellipsoid: Ellipsoid,
  result: Vector3
): Vector3 {
  const surfacePosition = ellipsoid.projectOnSurface(
    cameraPosition,
    vectorScratch
  )
  return surfacePosition != null
    ? ellipsoid
        .getOsculatingSphereCenter(surfacePosition, bottomRadius, result)
        .negate()
    : result.setScalar(0)
}
