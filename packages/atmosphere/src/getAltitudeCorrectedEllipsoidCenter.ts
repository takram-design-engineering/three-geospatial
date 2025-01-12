import { Vector3 } from 'three'

import { type Ellipsoid } from '@takram/three-geospatial'

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
    ? ellipsoid.getOsculatingSphereCenter(
        // Move the center of the atmosphere's inner sphere down to intersect
        // the viewpoint when it's located underground.
        surfacePosition.lengthSq() < cameraPosition.lengthSq()
          ? surfacePosition
          : cameraPosition,
        bottomRadius,
        result
      )
    : result.setScalar(0)
}
