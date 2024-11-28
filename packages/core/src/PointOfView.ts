import { Matrix4, Ray, Vector3, type Camera, type Quaternion } from 'three'

import { Ellipsoid } from './Ellipsoid'
import { clamp } from './math'

const EPSILON = 0.000001

const eastScratch = /*#__PURE__*/ new Vector3()
const northScratch = /*#__PURE__*/ new Vector3()
const upScratch = /*#__PURE__*/ new Vector3()
const vectorScratch1 = /*#__PURE__*/ new Vector3()
const vectorScratch2 = /*#__PURE__*/ new Vector3()
const matrixScratch = /*#__PURE__*/ new Matrix4()
const rayScratch = /*#__PURE__*/ new Ray()

export class PointOfView {
  target = new Vector3()

  // Radians from the local east direction relative from true north, measured
  // clockwise (90 degrees is true north, and -90 is true south).
  heading: number

  // Radians from the local horizon plane, measured with positive values looking
  // up (90 degrees is straight up, -90 is straight down).
  private _pitch!: number

  // Distance from the target.
  private _distance!: number

  constructor(target?: Vector3, heading = 0, pitch = 0, distance = 0) {
    if (target != null) {
      this.target.copy(target)
    }
    this.heading = heading
    this.pitch = pitch
    this.distance = distance
  }

  get pitch(): number {
    return this._pitch
  }

  set pitch(value: number) {
    this._pitch = clamp(value, -Math.PI / 2 + EPSILON, Math.PI / 2 - EPSILON)
  }

  get distance(): number {
    return this._distance
  }

  set distance(value: number) {
    this._distance = Math.max(value, EPSILON)
  }

  set(target: Vector3, heading: number, pitch: number, distance: number): this {
    this.target.copy(target)
    this.heading = heading
    this.pitch = pitch
    this.distance = distance
    return this
  }

  clone(): PointOfView {
    return new PointOfView(
      this.target.clone(),
      this.heading,
      this.pitch,
      this.distance
    )
  }

  copy(other: PointOfView): this {
    this.target.copy(other.target)
    this.heading = other.heading
    this.pitch = other.pitch
    this.distance = other.distance
    return this
  }

  equals(other: PointOfView): boolean {
    return (
      other.target.equals(this.target) &&
      other.heading === this.heading &&
      other.pitch === this.pitch &&
      other.distance === this.distance
    )
  }

  decompose(
    position: Vector3,
    quaternion: Quaternion,
    up: Vector3,
    ellipsoid = Ellipsoid.WGS84
  ): void {
    ellipsoid.getEastNorthUpVectors(this.target, eastScratch, northScratch, up)

    // h = east * cos(heading) + north * sin(heading)
    // v = h * cos(pitch) + up * sin(pitch)
    const offset = vectorScratch1
      .copy(eastScratch)
      .multiplyScalar(Math.cos(this.heading))
      .add(
        vectorScratch2.copy(northScratch).multiplyScalar(Math.sin(this.heading))
      )
      .multiplyScalar(Math.cos(this.pitch))
      .add(vectorScratch2.copy(up).multiplyScalar(Math.sin(this.pitch)))
      .normalize()
      .multiplyScalar(this.distance)

    position.copy(this.target).sub(offset)
    quaternion.setFromRotationMatrix(
      matrixScratch.lookAt(position, this.target, up)
    )
  }

  setFromCamera(camera: Camera, ellipsoid = Ellipsoid.WGS84): this | undefined {
    const position = vectorScratch1.setFromMatrixPosition(camera.matrixWorld)
    const direction = vectorScratch2
      .set(0, 0, 0.5)
      .unproject(camera)
      .sub(position)
      .normalize()
    const intersection = ellipsoid.getIntersection(
      rayScratch.set(position, direction)
    )
    if (intersection == null) {
      return
    }

    this.target.copy(intersection)
    this.distance = position.distanceTo(intersection)
    ellipsoid.getEastNorthUpVectors(
      intersection,
      eastScratch,
      northScratch,
      upScratch
    )
    this.heading = Math.atan2(
      northScratch.dot(direction),
      eastScratch.dot(direction)
    )
    this.pitch = Math.asin(upScratch.dot(direction))

    return this
  }
}
