import { Vector3 } from 'three'

import { Ellipsoid } from './Ellipsoid'
import { projectToEllipsoid } from './projectToEllipsoid'

const vectorScratch1 = new Vector3()
const vectorScratch2 = new Vector3()

export class Cartographic {
  constructor(
    public longitude = 0,
    public latitude = 0,
    public height = 0
  ) {}

  set(longitude: number, latitude: number, height: number): this {
    this.longitude = longitude
    this.latitude = latitude
    this.height = height
    return this
  }

  clone(): Cartographic {
    return new Cartographic(this.longitude, this.latitude, this.height)
  }

  copy(other: Cartographic): this {
    this.longitude = other.longitude
    this.latitude = other.latitude
    this.height = other.height
    return this
  }

  equals(other: Cartographic): boolean {
    return (
      other.longitude === this.longitude &&
      other.latitude === this.latitude &&
      other.height === this.height
    )
  }

  setLongitude(value: number): this {
    this.longitude = value
    return this
  }

  setLatitude(value: number): this {
    this.latitude = value
    return this
  }

  setHeight(value: number): this {
    this.height = value
    return this
  }

  setFromVector(
    vector: Vector3,
    ellipsoid = Ellipsoid.WGS84,
    centerTolerance?: number
  ): this {
    const oneOverRadiiSquared = ellipsoid.oneOverRadiiSquared(vectorScratch1)
    const projection = projectToEllipsoid(
      vector,
      oneOverRadiiSquared,
      centerTolerance,
      vectorScratch2
    )
    if (projection == null) {
      throw new Error()
    }
    const normal = vectorScratch1
      .multiplyVectors(projection, oneOverRadiiSquared)
      .normalize()
    this.longitude = Math.atan2(normal.y, normal.x)
    this.latitude = Math.asin(normal.z)
    const height = vectorScratch1.subVectors(vector, projection)
    this.height = Math.sign(height.dot(vector)) * height.length()
    return this
  }

  toVector(ellipsoid = Ellipsoid.WGS84, result = new Vector3()): Vector3 {
    const radiiSquared = vectorScratch1.multiplyVectors(
      ellipsoid.radii,
      ellipsoid.radii
    )
    const cosLatitude = Math.cos(this.latitude)
    const normal = vectorScratch2
      .set(
        cosLatitude * Math.cos(this.longitude),
        cosLatitude * Math.sin(this.longitude),
        Math.sin(this.latitude)
      )
      .normalize()
    result.multiplyVectors(radiiSquared, normal)
    return result
      .divideScalar(Math.sqrt(normal.dot(result)))
      .add(normal.multiplyScalar(this.height))
  }

  fromArray(array: readonly number[], offset = 0): this {
    this.longitude = array[offset]
    this.latitude = array[offset + 1]
    this.height = array[offset + 2]
    return this
  }

  toArray(array: number[] = [], offset = 0): number[] {
    array[offset] = this.longitude
    array[offset + 1] = this.latitude
    array[offset + 2] = this.height
    return array
  }

  *[Symbol.iterator](): Generator<number> {
    yield this.longitude
    yield this.latitude
    yield this.height
  }
}
