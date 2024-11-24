/* eslint-env worker */

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
  const [geometryLike, transfer] = toBufferGeometryLike(
    toCreasedNormalsImpl(fromBufferGeometryLike(input), creaseAngle)
  )
  return Transfer(geometryLike, transfer)
}
