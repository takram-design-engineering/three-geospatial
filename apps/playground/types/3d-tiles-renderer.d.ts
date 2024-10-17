export {}

declare module '3d-tiles-renderer' {
  export class GlobeControls {
    constructor(
      scene?: Scene | null,
      camera?: Camera | null,
      domElement?: Element | null,
      tilesRenderer: TilesRenderer
    )

    enabled: boolean
    cameraRadius: number
    rotationSpeed: number
    minAltitude: number
    maxAltitude: number
    minDistance: number
    maxDistance: number
    minZoom: number
    maxZoom: number
    zoomSpeed: number
    adjustHeight: boolean
    enableDamping: boolean
    dampingFactor: number

    update: () => void
    dispose: () => void
  }
}
