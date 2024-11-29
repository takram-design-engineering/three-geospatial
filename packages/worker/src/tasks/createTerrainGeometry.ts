/* eslint-env worker */

import decode from '@here/quantized-mesh-decoder'
import { type Vector3Like } from 'three'

import {
  TilingScheme,
  toBufferGeometryLike,
  type TileCoordinateLike,
  type TilingSchemeLike
} from '@takram/three-geospatial'
import { TerrainGeometry } from '@takram/three-terrain-core'

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

  const tilingScheme = new TilingScheme().copy(tilingSchemeLike)
  const rectangle = tilingScheme.getRectangle({ x, y, z })

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
