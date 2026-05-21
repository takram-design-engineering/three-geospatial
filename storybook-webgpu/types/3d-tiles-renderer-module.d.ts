import type { TilesRenderer } from '3d-tiles-renderer'
import type { TiledImageSource } from '3d-tiles-renderer/src/three/plugins/images/sources/TiledImageSource.js'

export {}

declare module '3d-tiles-renderer/plugins' {
  interface ReorientationPlugin {
    lat?: number
    lon?: number
    height?: number
  }

  interface ImageOverlayPlugin {
    meshParams: Map<Object3D, {}>
    _wrapMaterials(scene: Object3D): void
  }

  interface TiledImageOverlay {
    imageSource: TiledImageSource
  }

  interface UpdateOnChangePlugin {
    tiles?: TilesRenderer | null
    needsUpdate: boolean

    init(tiles: TilesRenderer): void
    doTilesNeedUpdate(): boolean
    dispose(): void
  }
}
