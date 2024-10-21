import { Matrix4, Vector3 } from 'three'

import { projectOnGeodeticSurface } from './projectOnGeodeticSurface'

const vectorScratch1 = /*#__PURE__*/ new Vector3()
const vectorScratch2 = /*#__PURE__*/ new Vector3()
const vectorScratch3 = /*#__PURE__*/ new Vector3()

// TODO: Rename to spheroid perhaps?
export class Ellipsoid {
  static WGS84 = new Ellipsoid(6378137, 6378137, 6356752.3142451793)

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
    return result.set(
      this.radii.x === 0 ? 0 : 1 / this.radii.x,
      this.radii.y === 0 ? 0 : 1 / this.radii.y,
      this.radii.z === 0 ? 0 : 1 / this.radii.z
    )
  }

  reciprocalRadiiSquared(result = new Vector3()): Vector3 {
    return result.set(
      this.radii.x === 0 ? 0 : 1 / (this.radii.x * this.radii.x),
      this.radii.y === 0 ? 0 : 1 / (this.radii.y * this.radii.y),
      this.radii.z === 0 ? 0 : 1 / (this.radii.z * this.radii.z)
    )
  }

  projectOnSurface(
    position: Vector3,
    centerTolerance?: number,
    result = new Vector3()
  ): Vector3 | undefined {
    return projectOnGeodeticSurface(
      position,
      this.reciprocalRadiiSquared(),
      centerTolerance,
      result
    )
  }

  getSurfaceNormal(position: Vector3, result = new Vector3()): Vector3 {
    return result
      .multiplyVectors(this.reciprocalRadiiSquared(vectorScratch1), position)
      .normalize()
  }

  getEastNorthUpFrame(position: Vector3, result = new Matrix4()): Matrix4 {
    const east = vectorScratch1
    const north = vectorScratch2
    const up = vectorScratch3
    this.getSurfaceNormal(position, up)
    east.set(-position.y, position.x, 0).normalize()
    north.crossVectors(up, east).normalize()
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
