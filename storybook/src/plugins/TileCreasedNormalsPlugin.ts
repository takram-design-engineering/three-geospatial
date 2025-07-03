import type { Tile } from '3d-tiles-renderer'
import { BufferGeometry, Mesh, type Object3D } from 'three'

import {
  fromBufferGeometryLike,
  toBufferGeometryLike
} from '@takram/three-geospatial'

import { queueTask } from '../worker/pool'

async function toCreasedNormalsAsync(
  geometry: BufferGeometry,
  creaseAngle?: number
): Promise<BufferGeometry> {
  const [geometryLike, transfer] = toBufferGeometryLike(geometry)
  const result = await queueTask(
    'toCreasedNormals',
    [geometryLike, creaseAngle],
    { transfer }
  )
  return fromBufferGeometryLike(result, geometry)
}

export interface TileCreasedNormalsPluginOptions {
  creaseAngle?: number
}

export class TileCreasedNormalsPlugin {
  readonly options: TileCreasedNormalsPluginOptions

  constructor(options?: TileCreasedNormalsPluginOptions) {
    this.options = { ...options }
  }

  // Plugin method
  async processTileModel(scene: Object3D, tile: Tile): Promise<void> {
    const meshes: Mesh[] = []
    scene.traverse(object => {
      if (object instanceof Mesh && object.geometry instanceof BufferGeometry) {
        meshes.push(object)
      }
    })
    await Promise.all(
      meshes.map(async mesh => {
        mesh.geometry = await toCreasedNormalsAsync(
          mesh.geometry,
          this.options.creaseAngle
        )
      })
    )
  }
}
