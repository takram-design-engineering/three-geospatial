import type { TilesRenderer, TilesRendererEventMap } from '3d-tiles-renderer'
import { Mesh, type Material } from 'three'

export interface TileOverrideMaterialPluginOptions {
  material?: Material
}

export class TileOverrideMaterialPlugin {
  readonly options: TileOverrideMaterialPluginOptions
  tiles?: TilesRenderer

  constructor(options?: TileOverrideMaterialPluginOptions) {
    this.options = { ...options }
  }

  private readonly handleTileVisibilityChange = ({
    scene,
    visible
  }: TilesRendererEventMap['tile-visibility-change']): void => {
    if (visible && scene instanceof Mesh) {
      scene.material = this.options.material
    }
  }

  // Plugin method
  init(tiles: TilesRenderer): void {
    this.tiles = tiles
    tiles.group.traverse(object => {
      if (object instanceof Mesh) {
        object.material = this.options.material
      }
    })
    tiles.addEventListener(
      'tile-visibility-change',
      this.handleTileVisibilityChange
    )
  }

  // Plugin method
  dispose(): void {
    this.tiles?.removeEventListener(
      'tile-visibility-change',
      this.handleTileVisibilityChange
    )
  }
}
