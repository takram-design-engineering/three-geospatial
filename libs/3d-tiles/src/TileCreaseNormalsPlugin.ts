import { type Tile } from '3d-tiles-renderer'
import { BufferGeometry, Mesh, type Object3D } from 'three'

import { type Plugin } from './lib'
import { toCreasedNormalsAsync } from './toCreasedNormalsAsync'

export interface TileCreaseNormalsPluginOptions {
  creaseAngle?: number
}

export class TileCreaseNormalsPlugin implements Plugin {
  readonly options: TileCreaseNormalsPluginOptions

  constructor(options?: TileCreaseNormalsPluginOptions) {
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
