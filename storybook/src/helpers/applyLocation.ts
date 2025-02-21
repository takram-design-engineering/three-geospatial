import { Quaternion, Vector3, type Camera } from 'three'
import { type OrbitControls } from 'three-stdlib'

import {
  Ellipsoid,
  Geodetic,
  radians,
  type GeodeticLike
} from '@takram/three-geospatial'

const geodetic = new Geodetic()
const position = new Vector3()
const up = new Vector3()
const offset = new Vector3()
const rotation = new Quaternion()

export function applyLocation(
  camera: Camera,
  controls: OrbitControls,
  { longitude, latitude, height }: GeodeticLike,
  resultPosition?: Vector3
): void {
  geodetic.set(radians(longitude), radians(latitude), height)
  geodetic.toECEF(position)
  Ellipsoid.WGS84.getSurfaceNormal(position, up)

  rotation.setFromUnitVectors(camera.up, up)
  offset.copy(camera.position).sub(controls.target)
  offset.applyQuaternion(rotation)
  camera.up.copy(up)
  camera.position.copy(position).add(offset)
  controls.target.copy(position)

  resultPosition?.copy(position)
}
