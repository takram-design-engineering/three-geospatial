import { Vector3 } from 'three'

import { type Ellipsoid } from '@takram/three-geospatial'

const vectorScratch = /*#__PURE__*/ new Vector3()

export function correctAtmosphereAltitude(
  target: {
    ellipsoid: Ellipsoid
    correctAltitude: boolean
  },
  cameraPosition: Vector3,
  atmosphereBottomRadius: number,
  ellipsoidCenter: Vector3
): void {
  if (target.correctAltitude) {
    const surfacePosition = target.ellipsoid.projectOnSurface(
      cameraPosition,
      vectorScratch
    )
    if (surfacePosition != null) {
      target.ellipsoid.getOsculatingSphereCenter(
        // Move the center of the atmosphere's inner sphere down to intersect
        // the viewpoint when it's located underground.
        surfacePosition.lengthSq() < cameraPosition.lengthSq()
          ? surfacePosition
          : cameraPosition,
        atmosphereBottomRadius,
        ellipsoidCenter
      )
    }
  } else {
    ellipsoidCenter.set(0, 0, 0)
  }
}
