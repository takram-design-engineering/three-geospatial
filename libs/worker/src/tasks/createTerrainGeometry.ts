/* eslint-env worker */

import decode from '@here/quantized-mesh-decoder'
import { type Vector3Like } from 'three'

import {
  Rectangle,
  TilingScheme,
  toBufferGeometryLike,
  type TileCoordinateLike,
  type TilingSchemeLike
} from '@geovanni/core'
import { TerrainGeometry } from '@geovanni/terrain-core'

import { Transfer, type TransferResult } from '../transfer'

export function createTerrainGeometry(
  data: ArrayBuffer,
  tilingSchemeLike: TilingSchemeLike,
  { x, y, z }: TileCoordinateLike,
  computeVertexNormals = true
): TransferResult<{
  geometry: TerrainGeometry
  position: Vector3Like
}> {
  const decoded = decode(data)

  // TODO: Make tms coordinate conversion generic.
  const tilingScheme = new TilingScheme().copy(tilingSchemeLike)
  const size = tilingScheme.getSize(z)
  const rect = tilingScheme.tileToRectangle({ x, y: size.y - y - 1, z })
  const rectangle = new Rectangle(rect.west, rect.south, rect.east, rect.north)

  const geometry = new TerrainGeometry(decoded, rectangle)
  geometry.computeBoundingSphere() // Much cheaper to compute this here.
  if (computeVertexNormals) {
    geometry.computeVertexNormals()
  }
  const [geometryLike, transfer] = toBufferGeometryLike(geometry)
  return Transfer(
    {
      geometry: geometryLike,
      position: geometry.position
    },
    transfer
  )
}
