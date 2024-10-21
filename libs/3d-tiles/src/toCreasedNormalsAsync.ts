import { pick } from 'lodash'
import { BufferAttribute, type BufferGeometry } from 'three'

import { isNotNullish } from '@geovanni/core'
import { queueTask } from '@geovanni/worker'

export async function toCreasedNormalsAsync(
  geometry: BufferGeometry,
  creaseAngle?: number
): Promise<BufferGeometry> {
  const result = await queueTask(
    'toCreasedNormals',
    [pick(geometry, ['attributes', 'index']), creaseAngle],
    {
      transfer: [
        ...Object.values(geometry.attributes).map(
          attribute => attribute.array.buffer
        ),
        geometry.index?.array.buffer
      ].filter(isNotNullish)
    }
  )
  for (const [name, attribute] of Object.entries(result.attributes)) {
    geometry.setAttribute(
      name,
      new BufferAttribute(
        attribute.array,
        attribute.itemSize,
        attribute.normalized
      )
    )
  }
  geometry.index =
    result.index != null
      ? new BufferAttribute(
          result.index.array,
          result.index.itemSize,
          result.index.normalized
        )
      : null
  return geometry
}
