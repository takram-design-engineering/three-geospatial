/* eslint-env worker */

import decode from '@here/quantized-mesh-decoder'

import {
  Rectangle,
  TilingScheme,
  toBufferGeometryLike,
  type TileCoordinateLike,
  type TilingSchemeLike
} from '@geovanni/core'
// TODO
// eslint-disable-next-line @nx/enforce-module-boundaries
import { TerrainGeometry } from '@geovanni/terrain'

import { Transfer, type TransferResult } from '../transfer'

export function createTerrainGeometry(
  data: ArrayBuffer,
  tilingSchemeLike: TilingSchemeLike,
  { x, y, z }: TileCoordinateLike,
  computeVertexNormals = true
): TransferResult<TerrainGeometry> {
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
  return Transfer(geometryLike, transfer)
}
