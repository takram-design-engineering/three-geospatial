import { type BufferGeometry } from 'three'

import { fromBufferGeometryLike, toBufferGeometryLike } from '@geovanni/core'
import { queueTask } from '@geovanni/worker'

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
