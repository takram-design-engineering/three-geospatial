import { Vector3 } from 'three'

import { Ellipsoid } from './Ellipsoid'
import {
  projectOnEllipsoidSurface,
  type ProjectOnEllipsoidSurfaceOptions
} from './helpers/projectOnEllipsoidSurface'

export type GeodeticTuple = [number, number, number]

export interface GeodeticLike {
  readonly longitude: number
  readonly latitude: number
  readonly height: number
}

const vectorScratch1 = /*#__PURE__*/ new Vector3()
const vectorScratch2 = /*#__PURE__*/ new Vector3()

export class Geodetic {
  static readonly MIN_LONGITUDE = -Math.PI
  static readonly MAX_LONGITUDE = Math.PI
  static readonly MIN_LATITUDE = -Math.PI / 2
  static readonly MAX_LATITUDE = Math.PI / 2

  constructor(
    public longitude = 0,
    public latitude = 0,
    public height = 0
  ) {}

  set(longitude: number, latitude: number, height?: number): this {
    this.longitude = longitude
    this.latitude = latitude
    if (height != null) {
      this.height = height
    }
    return this
  }

  clone(): Geodetic {
    return new Geodetic(this.longitude, this.latitude, this.height)
  }

  copy(other: GeodeticLike): this {
    this.longitude = other.longitude
    this.latitude = other.latitude
    this.height = other.height
    return this
  }

  equals(other: GeodeticLike): boolean {
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

  normalize(): this {
    if (this.longitude < Geodetic.MIN_LONGITUDE) {
      this.longitude += Math.PI * 2
    }
    return this
  }

  // See: https://en.wikipedia.org/wiki/Geographic_coordinate_conversion
  // Reference: https://github.com/CesiumGS/cesium/blob/1.122/packages/engine/Source/Core/Geodetic.js#L119
  setFromECEF(
    position: Vector3,
    options?: ProjectOnEllipsoidSurfaceOptions & {
      ellipsoid?: Ellipsoid
    }
  ): this {
    const ellipsoid = options?.ellipsoid ?? Ellipsoid.WGS84
    const reciprocalRadiiSquared =
      ellipsoid.reciprocalRadiiSquared(vectorScratch1)
    const projection = projectOnEllipsoidSurface(
      position,
      reciprocalRadiiSquared,
      vectorScratch2,
      options
    )
    if (projection == null) {
      throw new Error(
        `Could not project position to ellipsoid surface: ${position.toArray()}`
      )
    }
    const normal = vectorScratch1
      .multiplyVectors(projection, reciprocalRadiiSquared)
      .normalize()
    this.longitude = Math.atan2(normal.y, normal.x)
    this.latitude = Math.asin(normal.z)
    const height = vectorScratch1.subVectors(position, projection)
    this.height = Math.sign(height.dot(position)) * height.length()
    return this
  }

  // See: https://en.wikipedia.org/wiki/Geographic_coordinate_conversion
  // Reference: https://github.com/CesiumGS/cesium/blob/1.122/packages/engine/Source/Core/Cartesian3.js#L916
  toECEF(
    result = new Vector3(),
    options?: {
      ellipsoid?: Ellipsoid
    }
  ): Vector3 {
    const ellipsoid = options?.ellipsoid ?? Ellipsoid.WGS84
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
