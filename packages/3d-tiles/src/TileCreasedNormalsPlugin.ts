import { type Tile } from '3d-tiles-renderer'
import { BufferGeometry, Mesh, type Object3D } from 'three'

import { toCreasedNormalsAsync } from './toCreasedNormalsAsync'

export interface TileCreasedNormalsPluginOptions {
  creaseAngle?: number
}

export class TileCreasedNormalsPlugin {
  readonly options: TileCreasedNormalsPluginOptions

  constructor(options?: TileCreasedNormalsPluginOptions) {
    this.options = { ...options }
  }

  async processTileModel(scene: Object3D, tile: Tile): Promise<void> {
    const meshes: Array<Mesh<BufferGeometry>> = []
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

/** @deprecated Use TileCreasedNormalsPlugin instead. */
export const TileCreaseNormalsPlugin = TileCreasedNormalsPlugin
