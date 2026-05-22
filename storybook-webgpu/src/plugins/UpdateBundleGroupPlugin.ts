import type { TilesRenderer } from '3d-tiles-renderer'
import type { BundleGroup } from 'three/webgpu'

export class UpdateBundleGroupPlugin {
  tiles?: TilesRenderer
  bundleGroup?: BundleGroup

  private readonly setNeedsUpdate = (): void => {
    const { bundleGroup } = this
    if (bundleGroup != null) {
      bundleGroup.needsUpdate = true
    }
  }

  // Plugin method
  init(tiles: TilesRenderer): void {
    this.tiles = tiles
    tiles.addEventListener('needs-render', this.setNeedsUpdate)
  }

  dispose(): void {
    this.tiles?.removeEventListener('needs-render', this.setNeedsUpdate)
  }
}
