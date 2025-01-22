import { Vector3 } from 'three'

import { type Ellipsoid } from '@takram/three-geospatial'

const vectorScratch = /*#__PURE__*/ new Vector3()

export function getAltitudeCorrectionOffset(
  cameraPosition: Vector3,
  bottomRadius: number,
  ellipsoid: Ellipsoid,
  result: Vector3,
  clipToSurface = true
): Vector3 {
  const surfacePosition = ellipsoid.projectOnSurface(
    cameraPosition,
    vectorScratch
  )
  return surfacePosition != null
    ? ellipsoid.getOsculatingSphereCenter(
        // Move the center of the atmosphere's inner sphere down to intersect
        // the viewpoint when it's located underground.
        !clipToSurface || surfacePosition.lengthSq() < cameraPosition.lengthSq()
          ? surfacePosition
          : cameraPosition,
        bottomRadius,
        result
      )
    : result.setScalar(0)
}
