import { type BufferGeometry } from 'three'

import {
  fromBufferGeometryLike,
  toBufferGeometryLike
} from '@takram/three-geospatial'
import { queueTask } from '@takram/three-worker'

export async function toCreasedNormalsAsync(
  geometry: BufferGeometry,
  creaseAngle?: number
): Promise<BufferGeometry> {
  const [geometryLike, transfer] = toBufferGeometryLike(geometry)
  const result = await queueTask(
    'toCreasedNormals',
    [geometryLike, creaseAngle],
    { transfer }
  )
  return fromBufferGeometryLike(result, geometry)
}
