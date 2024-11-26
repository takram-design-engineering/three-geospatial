import {
  Matrix4,
  Ray,
  Vector3,
  type PerspectiveCamera,
  type Quaternion
} from 'three'

import { Ellipsoid } from './Ellipsoid'

const east = /*#__PURE__*/ new Vector3()
const north = /*#__PURE__*/ new Vector3()
const up = /*#__PURE__*/ new Vector3()
const ray = /*#__PURE__*/ new Ray()
const vectorScratch1 = /*#__PURE__*/ new Vector3()
const vectorScratch2 = /*#__PURE__*/ new Vector3()
const matrixScratch = /*#__PURE__*/ new Matrix4()

export class PointOfView {
  target: Vector3
  heading: number
  pitch: number
  distance: number

  constructor(target = new Vector3(), heading = 0, pitch = 0, distance = 0) {
    this.target = target
    this.heading = heading
    this.pitch = pitch
    this.distance = distance
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

  // TODO: Deal with boundary condition.
  decompose(
    position: Vector3,
    quaternion: Quaternion,
    ellipsoid = Ellipsoid.WGS84
  ): void {
    ellipsoid.getEastNorthUpVectors(this.target, east, north, up)

    // h = east * cos(heading) - north * sin(heading)
    // v = h * cos(pitch) + up * sin(pitch)
    const offset = vectorScratch1
      .copy(east)
      .multiplyScalar(Math.cos(this.heading))
      .sub(vectorScratch2.copy(north).multiplyScalar(Math.sin(this.heading)))
      .multiplyScalar(Math.cos(this.pitch))
      .add(vectorScratch2.copy(up).multiplyScalar(Math.sin(this.pitch)))
      .normalize()
      .multiplyScalar(this.distance)

    position.copy(this.target).sub(offset)
    quaternion.setFromRotationMatrix(
      matrixScratch.lookAt(position, this.target, up)
    )
  }

  // TODO: Deal with boundary condition.
  setFromCamera(
    camera: PerspectiveCamera,
    ellipsoid = Ellipsoid.WGS84
  ): this | undefined {
    const position = vectorScratch1.setFromMatrixPosition(camera.matrixWorld)
    const direction = vectorScratch2
      .set(0, 0, 0.5)
      .unproject(camera)
      .sub(position)
      .normalize()
    const intersection = ellipsoid.getIntersection(ray.set(position, direction))
    if (intersection == null) {
      return
    }

    this.target.copy(intersection)
    this.distance = position.distanceTo(intersection)
    ellipsoid.getEastNorthUpVectors(intersection, east, north, up)
    this.heading = Math.atan2(-north.dot(direction), east.dot(direction))
    this.pitch = Math.asin(up.dot(direction))

    return this
  }
}
