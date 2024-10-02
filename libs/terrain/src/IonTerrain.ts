import decode, { type QuantizedMeshData } from '@here/quantized-mesh-decoder'
import stringTemplate from 'string-template'

import { TilingScheme } from '@geovanni/core'

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

export interface TileParams {
  x: number
  y: number
  z: number
}

export class IonTerrain extends IonAsset {
  // TODO: Construct from layer.
  readonly tilingScheme = new TilingScheme()

  private layerPromise?: Promise<Layer>

  async fetchTile(params: TileParams): Promise<QuantizedMeshData> {
    const layer = await this.loadLayer()
    const [template] = layer.tiles
    return decode(
      await this.fetch<ArrayBuffer>(
        stringTemplate(template, { ...params, version: layer.version }),
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
    )
  }

  async loadLayer(): Promise<Layer> {
    if (this.layerPromise == null) {
      this.layerPromise = (async () => await this.fetch<Layer>('layer.json'))()
    }
    return await this.layerPromise
  }
}
