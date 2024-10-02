declare module '3d-tiles-renderer/src/three/controls/GlobeControls' {
  import { type TilesRenderer } from '3d-tiles-renderer'
  import { type Scene, type Camera } from 'three'

  export class GlobeControls {
    constructor(
      scene?: Scene | null,
      camera?: Camera | null,
      domElement?: Element | null,
      tilesRenderer: TilesRenderer
    )

    enableDamping: boolean

    update: () => void
    dispose: () => void
  }
}
