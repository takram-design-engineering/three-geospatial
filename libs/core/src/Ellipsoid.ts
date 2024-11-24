import { Matrix4, Vector3 } from 'three'

import {
  projectOnEllipsoidSurface,
  type ProjectOnEllipsoidSurfaceOptions
} from './projectOnEllipsoidSurface'

const vectorScratch1 = /*#__PURE__*/ new Vector3()
const vectorScratch2 = /*#__PURE__*/ new Vector3()
const vectorScratch3 = /*#__PURE__*/ new Vector3()

export class Ellipsoid {
  static WGS84 = /*#__PURE__*/ new Ellipsoid(
    6378137,
    6378137,
    6356752.3142451793
  )

  readonly radii: Vector3

  constructor(x: number, y: number, z: number) {
    this.radii = new Vector3(x, y, z)
  }

  get minimumRadius(): number {
    return Math.min(this.radii.x, this.radii.y, this.radii.z)
  }

  get maximumRadius(): number {
    return Math.max(this.radii.x, this.radii.y, this.radii.z)
  }

  reciprocalRadii(result = new Vector3()): Vector3 {
    const { x, y, z } = this.radii
    return result.set(1 / x, 1 / y, 1 / z)
  }

  reciprocalRadiiSquared(result = new Vector3()): Vector3 {
    const { x, y, z } = this.radii
    return result.set(1 / x ** 2, 1 / y ** 2, 1 / z ** 2)
  }

  projectOnSurface(
    position: Vector3,
    result = new Vector3(),
    options?: ProjectOnEllipsoidSurfaceOptions
  ): Vector3 | undefined {
    return projectOnEllipsoidSurface(
      position,
      this.reciprocalRadiiSquared(),
      result,
      options
    )
  }

  getSurfaceNormal(position: Vector3, result = new Vector3()): Vector3 {
    return result
      .multiplyVectors(this.reciprocalRadiiSquared(vectorScratch1), position)
      .normalize()
  }

  getEastNorthUpVectors(
    position: Vector3,
    east = new Vector3(),
    north = new Vector3(),
    up = new Vector3()
  ): void {
    this.getSurfaceNormal(position, up)
    east.set(-position.y, position.x, 0).normalize()
    north.crossVectors(up, east).normalize()
  }

  getEastNorthUpFrame(position: Vector3, result = new Matrix4()): Matrix4 {
    const east = vectorScratch1
    const north = vectorScratch2
    const up = vectorScratch3
    this.getEastNorthUpVectors(position, east, north, up)
    return result.makeBasis(east, north, up).setPosition(position)
  }

  getOsculatingSphereCenter(
    surfacePosition: Vector3,
    radius: number,
    result = new Vector3()
  ): Vector3 {
    const xySquared = this.radii.x ** 2
    const normal = vectorScratch1
      .set(
        surfacePosition.x / xySquared,
        surfacePosition.y / xySquared,
        surfacePosition.z / this.radii.z ** 2
      )
      .normalize()
    return result.copy(normal.multiplyScalar(-radius).add(surfacePosition))
  }
}
