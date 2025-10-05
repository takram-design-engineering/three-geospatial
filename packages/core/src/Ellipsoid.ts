import { Matrix4, Vector3, type Ray } from 'three'
import invariant from 'tiny-invariant'

import {
  projectOnEllipsoidSurface,
  type ProjectOnEllipsoidSurfaceOptions
} from './helpers/projectOnEllipsoidSurface'

const vectorScratch1 = /*#__PURE__*/ new Vector3()
const vectorScratch2 = /*#__PURE__*/ new Vector3()
const vectorScratch3 = /*#__PURE__*/ new Vector3()

// TODO: Define by major axis and reciprocal of flattening.
export class Ellipsoid {
  static readonly WGS84 = /*#__PURE__*/ new Ellipsoid(
    6378137,
    6378137,
    6356752.3142451793
  )

  readonly radii: Vector3

  constructor(x: number, y: number, z: number) {
    this.radii = new Vector3(x, y, z)
  }

  // TODO: Rename to semiMinorAxis
  get minimumRadius(): number {
    return Math.min(this.radii.x, this.radii.y, this.radii.z)
  }

  // TODO: Rename to semiMajorAxis
  get maximumRadius(): number {
    return Math.max(this.radii.x, this.radii.y, this.radii.z)
  }

  get flattening(): number {
    return 1 - this.minimumRadius / this.maximumRadius
  }

  get eccentricity(): number {
    return Math.sqrt(this.eccentricitySquared)
  }

  get eccentricitySquared(): number {
    const a2 = this.maximumRadius ** 2
    const b2 = this.minimumRadius ** 2
    return (a2 - b2) / a2
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

  getNorthUpEastFrame(position: Vector3, result = new Matrix4()): Matrix4 {
    const east = vectorScratch1
    const north = vectorScratch2
    const up = vectorScratch3
    this.getEastNorthUpVectors(position, east, north, up)
    return result.makeBasis(north, up, east).setPosition(position)
  }

  getIntersection(ray: Ray, result = new Vector3()): Vector3 | undefined {
    const reciprocalRadii = this.reciprocalRadii(vectorScratch1)
    const p = vectorScratch2.copy(reciprocalRadii).multiply(ray.origin)
    const d = vectorScratch3.copy(reciprocalRadii).multiply(ray.direction)
    const p2 = p.lengthSq()
    const d2 = d.lengthSq()
    const pd = p.dot(d)
    const discriminant = pd ** 2 - d2 * (p2 - 1)
    if (p2 === 1) {
      return result.copy(ray.origin)
    }
    if (p2 > 1) {
      if (pd >= 0 || discriminant < 0) {
        return // No intersection
      }
      const Q = Math.sqrt(discriminant)
      const t1 = (-pd - Q) / d2
      const t2 = (-pd + Q) / d2
      return ray.at(Math.min(t1, t2), result)
    }
    if (p2 < 1) {
      const discriminant = pd ** 2 - d2 * (p2 - 1)
      const Q = Math.sqrt(discriminant)
      const t = (-pd + Q) / d2
      return ray.at(t, result) // Backface of the ellipsoid
    }
    if (pd < 0) {
      return ray.at(-pd / d2, result) // Backface of the ellipsoid
    }
    // No intersection
  }

  getOsculatingSphereCenter(
    surfacePosition: Vector3,
    radius: number,
    result = new Vector3()
  ): Vector3 {
    invariant(this.radii.x === this.radii.y)
    const a2 = this.radii.x ** 2
    const b2 = this.radii.z ** 2
    const normal = vectorScratch1
      .set(
        surfacePosition.x / a2,
        surfacePosition.y / a2,
        surfacePosition.z / b2
      )
      .normalize()
    return result.copy(normal.multiplyScalar(-radius).add(surfacePosition))
  }

  getNormalAtHorizon(
    position: Vector3,
    direction: Vector3,
    result = new Vector3()
  ): Vector3 {
    invariant(this.radii.x === this.radii.y)
    const a2 = this.radii.x ** 2
    const b2 = this.radii.z ** 2
    const p = position
    const v = direction
    let t = (p.x * v.x + p.y * v.y) / a2 + (p.z * v.z) / b2
    t /= (p.x ** 2 + p.y ** 2) / a2 + p.z ** 2 / b2
    const q = vectorScratch1.copy(v).multiplyScalar(-t).add(position)
    return result.set(q.x / a2, q.y / a2, q.z / b2).normalize()
  }
}
