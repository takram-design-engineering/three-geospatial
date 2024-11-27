export {}

declare module '3d-tiles-renderer' {
  export class GlobeControls {
    constructor(
      scene?: Scene | null,
      camera?: Camera | null,
      domElement?: Element | null,
      tilesRenderer?: TilesRenderer
    )

    enableDamping: boolean

    update: () => void
    dispose: () => void
  }
}
