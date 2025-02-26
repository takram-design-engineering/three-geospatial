// cSpell:words minzoom maxzoom octvertexnormals watermask

import stringTemplate from 'string-template'
import { Vector3, type BufferGeometry } from 'three'

import {
  fromBufferGeometryLike,
  TilingScheme,
  type TileCoordinateLike
} from '@takram/three-geospatial'
import { queueTask } from '@takram/three-geospatial-worker'

import { IonAsset } from './IonAsset'
import { type TerrainLayer } from './types'

export class IonTerrain extends IonAsset {
  // TODO: Construct from layer.
  readonly tilingScheme = new TilingScheme()

  private layerPromise?: Promise<TerrainLayer>

  async loadLayer(): Promise<TerrainLayer> {
    if (this.layerPromise == null) {
      this.layerPromise = (async () =>
        await this.fetch<TerrainLayer>('layer.json'))()
    }
    return await this.layerPromise
  }

  async fetchTile(coordinate: TileCoordinateLike): Promise<ArrayBuffer> {
    const layer = await this.loadLayer()
    const [template] = layer.tiles
    return await this.fetch<ArrayBuffer>(
      stringTemplate(template, { ...coordinate, version: layer.version }),
      {
        responseType: 'arraybuffer',
        params: {
          extensions: 'octvertexnormals-watermask-metadata'
        },
        headers: {
          Accept:
            'application/vnd.quantized-mesh;extensions=octvertexnormals-watermask-metadata'
        }
      }
    )
  }

  async createGeometry(
    coordinate: TileCoordinateLike,
    computeVertexNormals?: boolean
  ): Promise<{
    geometry: BufferGeometry
    position: Vector3
  }> {
    const result = await queueTask('createTerrainGeometry', [
      await this.fetchTile(coordinate),
      this.tilingScheme,
      coordinate,
      computeVertexNormals
    ])
    return {
      geometry: fromBufferGeometryLike(result.geometry),
      position: new Vector3().copy(result.position)
    }
  }
}
