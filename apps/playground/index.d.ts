/* eslint-disable @typescript-eslint/no-explicit-any */

declare module '*.svg' {
  const content: any
  export const ReactComponent: any
  export default content
}

declare module '*.glsl' {
  const content: string
  export default content
}

declare module '*.frag' {
  const content: string
  export default content
}

declare module '*.vert' {
  const content: string
  export default content
}

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
