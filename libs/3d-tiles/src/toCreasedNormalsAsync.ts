import { pick } from 'lodash'
import { BufferAttribute, type BufferGeometry } from 'three'
import workerpool from 'workerpool'

import { isNotNullish } from '@geovanni/core'

import { type CreasedNormalsResult } from './toCreasedNormalsWorker'
import worker from './worker?url'

const pool = workerpool.pool(worker, {
  workerOpts: {
    type: 'module'
  }
})

export async function toCreasedNormalsAsync(
  geometry: BufferGeometry,
  creaseAngle?: number
): Promise<BufferGeometry> {
  const result: CreasedNormalsResult = await pool.exec(
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
