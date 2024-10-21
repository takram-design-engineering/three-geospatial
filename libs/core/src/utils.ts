import { pick } from 'lodash'
import { BufferAttribute, BufferGeometry } from 'three'

import { isNotNullish } from './assertions'

export type BufferGeometryLike = Pick<
  BufferGeometry,
  'attributes' | 'index' | 'boundingBox' | 'boundingSphere'
>

export function toBufferGeometryLike(
  geometry: BufferGeometry
): [BufferGeometryLike, ArrayBuffer[]] {
  return [
    pick(geometry, ['attributes', 'index', 'boundingBox', 'boundingSphere']),
    [
      ...Object.values(geometry.attributes).map(
        attribute => attribute.array.buffer
      ),
      geometry.index?.array.buffer
    ].filter(isNotNullish)
  ]
}

export function fromBufferGeometryLike(
  input: BufferGeometryLike,
  result = new BufferGeometry()
): BufferGeometry {
  for (const [name, attribute] of Object.entries(input.attributes)) {
    result.setAttribute(
      name,
      new BufferAttribute(
        attribute.array,
        attribute.itemSize,
        attribute.normalized
      )
    )
  }
  result.index =
    input.index != null
      ? new BufferAttribute(
          input.index.array,
          input.index.itemSize,
          input.index.normalized
        )
      : null
  result.boundingBox = input.boundingBox
  result.boundingSphere = input.boundingSphere
  return result
}
