import type { TilesRenderer } from '3d-tiles-renderer'
import { UpdateOnChangePlugin } from '3d-tiles-renderer/three/plugins'
import type { BundleGroup } from 'three/webgpu'

export class UpdateOnChangeBundlePlugin extends UpdateOnChangePlugin {
  bundleGroup?: BundleGroup | null

  private readonly setNeedsUpdate = (): void => {
    const { bundleGroup } = this
    if (bundleGroup != null) {
      bundleGroup.needsUpdate = true
    }
  }

  override init(tiles: TilesRenderer): void {
    super.init(tiles)
    // For plugins such as TilesFadePlugin:
    tiles.addEventListener('needs-render', this.setNeedsUpdate)
  }

  override doTilesNeedUpdate(): boolean {
    const needsUpdate = super.doTilesNeedUpdate()
    const { bundleGroup } = this
    if (bundleGroup != null) {
      bundleGroup.needsUpdate = needsUpdate
    }
    return needsUpdate
  }

  override dispose(): void {
    this.tiles?.removeEventListener('needs-render', this.setNeedsUpdate)
    super.dispose()
  }
}
