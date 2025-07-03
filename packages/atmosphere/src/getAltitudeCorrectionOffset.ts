import { Vector3 } from 'three'

import type { Ellipsoid } from '@takram/three-geospatial'

import type { AtmosphereParameters } from './AtmosphereParameters'
import { METER_TO_LENGTH_UNIT } from './constants'

const vectorScratch = /*#__PURE__*/ new Vector3()

export function getAltitudeCorrectionOffset(
  cameraPosition: Vector3,
  atmosphere: AtmosphereParameters,
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
        atmosphere.bottomRadius / METER_TO_LENGTH_UNIT,
        result
      )
    : result.setScalar(0)
}
