import { Vector3 } from 'three'

import { closeTo } from './helpers'

export class Ellipsoid {
  static WGS84 = Object.freeze(
    new Ellipsoid(6378137, 6378137, 6356752.3142451793)
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

  radiiSquared(result = new Vector3()): Vector3 {
    return result.set(
      this.radii.x * this.radii.x,
      this.radii.y * this.radii.y,
      this.radii.z * this.radii.z
    )
  }

  oneOverRadii(result = new Vector3()): Vector3 {
    return result.set(
      this.radii.x === 0 ? 0 : 1 / this.radii.x,
      this.radii.y === 0 ? 0 : 1 / this.radii.y,
      this.radii.z === 0 ? 0 : 1 / this.radii.z
    )
  }

  oneOverRadiiSquared(result = new Vector3()): Vector3 {
    return result.set(
      this.radii.x === 0 ? 0 : 1 / (this.radii.x * this.radii.x),
      this.radii.y === 0 ? 0 : 1 / (this.radii.y * this.radii.y),
      this.radii.z === 0 ? 0 : 1 / (this.radii.z * this.radii.z)
    )
  }

  getSurfaceNormal(
    vector: Vector3,
    result = new Vector3()
  ): Vector3 | undefined {
    if (
      closeTo(vector.x, 0, 1e-14) &&
      closeTo(vector.y, 0, 1e-14) &&
      closeTo(vector.z, 0, 1e-14)
    ) {
      return undefined
    }
    const oneOverRadiiSquared = this.oneOverRadiiSquared(result)
    return result.multiplyVectors(vector, oneOverRadiiSquared).normalize()
  }
}
