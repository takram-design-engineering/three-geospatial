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

interface Range {
  startX: number
  startY: number
  endX: number
  endY: number
}

// Note that no spec is available.
interface Layer {
  available: readonly Range[][]
  bounds: readonly [number, number, number, number]
  extensions: string[]
  format: string
  minzoom: number
  maxzoom: number
  tiles: string[]
  version: string
}

export class IonTerrain extends IonAsset {
  // TODO: Construct from layer.
  readonly tilingScheme = new TilingScheme()

  private layerPromise?: Promise<Layer>

  async loadLayer(): Promise<Layer> {
    if (this.layerPromise == null) {
      this.layerPromise = (async () => await this.fetch<Layer>('layer.json'))()
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
