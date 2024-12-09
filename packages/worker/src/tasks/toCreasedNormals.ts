/* eslint-env worker */

import { Vector3 } from 'three'
import { toCreasedNormals as toCreasedNormalsImpl } from 'three-stdlib'

import {
  fromBufferGeometryLike,
  toBufferGeometryLike,
  type BufferGeometryLike
} from '@takram/three-geospatial'

import { Transfer, type TransferResult } from '../transfer'

export function toCreasedNormals(
  input: BufferGeometryLike,
  creaseAngle?: number
): TransferResult<BufferGeometryLike> {
  const geometry = toCreasedNormalsImpl(
    fromBufferGeometryLike(input),
    creaseAngle
  )

  // Triangles can be degenerate lines, producing zero normals and eventually
  // causing NaN values under SH. Fix this by replacing them with a non-zero
  // normal (they are hardly visible because they are degenerate).
  // See: https://github.com/takram-design-engineering/three-geospatial/issues/13
  const normal = geometry.getAttribute('normal')
  const v0 = new Vector3()
  const v1 = new Vector3()
  const v2 = new Vector3()
  for (let i = 0; i < normal.count; i += 3) {
    v0.fromBufferAttribute(normal, i + 0)
    v1.fromBufferAttribute(normal, i + 1)
    v2.fromBufferAttribute(normal, i + 2)
    if (v0.length() < 0.5 || v1.length() < 0.5 || v2.length() < 0.5) {
      normal.setXYZ(i + 0, 0, 0, 1)
      normal.setXYZ(i + 1, 0, 0, 1)
      normal.setXYZ(i + 2, 0, 0, 1)
    }
  }

  const [geometryLike, transfer] = toBufferGeometryLike(geometry)
  return Transfer(geometryLike, transfer)
}
