import { type TilesRenderer } from '3d-tiles-renderer'
import { Mesh, type Material } from 'three'

export interface TileOverrideMaterialPluginOptions {
  material?: Material
}

export class TileOverrideMaterialPlugin {
  readonly options: TileOverrideMaterialPluginOptions

  constructor(options?: TileOverrideMaterialPluginOptions) {
    this.options = { ...options }
  }

  // Plugin method
  init(tiles: TilesRenderer): void {
    tiles.group.traverse(object => {
      if (object instanceof Mesh) {
        object.material = this.options.material
      }
    })
    tiles.addEventListener('tile-visibility-change', ({ scene, visible }) => {
      if (visible && scene instanceof Mesh) {
        scene.material = this.options.material
      }
    })
  }
}
