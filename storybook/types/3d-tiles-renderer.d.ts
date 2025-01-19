import type { Ellipsoid, TilesGroup, TilesRenderer } from '3d-tiles-renderer'
import type {
  Camera,
  EventDispatcher,
  Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  Vector3
} from 'three'

export {}

declare module '3d-tiles-renderer' {
  export type CameraTransitionMode = 'perspective' | 'orthographic'

  export class CameraTransitionManager extends EventDispatcher<{
    'camera-change': {
      camera: Camera
      prevCamera: Camera
    }
    toggle: {}
    change: {}
    'transition-end': {}
  }> {
    readonly animating: boolean
    readonly camera: PerspectiveCamera | OrthographicCamera

    mode: CameraTransitionMode

    constructor(
      perspectiveCamera?: PerspectiveCamera,
      orthographicCamera?: OrthographicCamera
    )

    toggle(): void
    update(): void
    syncCameras(): void
  }

  export const NONE: 0
  export const DRAG: 1
  export const ROTATE: 2
  export const ZOOM: 3
  export const WAITING: 4

  export type EnvironmentControlsState =
    | typeof NONE
    | typeof DRAG
    | typeof ROTATE
    | typeof ZOOM
    | typeof WAITING

  export class EnvironmentControls extends EventDispatcher<{
    change: {}
    start: {}
    end: {}
  }> {
    enabled: boolean

    isEnvironmentControls?: boolean

    domElement: HTMLElement | null
    camera: Camera | null
    scene: Object3D | null
    tilesRenderer: TilesRenderer | null

    // settings
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

    // settings for GlobeControls
    reorientOnDrag: boolean
    scaleZoomOrientationAtEdges: boolean

    useFallbackPlane: boolean

    constructor(
      scene?: Object3D | null,
      camera?: Camera | null,
      domElement?: HTMLElement | null,
      tilesRenderer?: TilesRenderer | null
    )

    setScene(scene: Object3D): void
    setCamera(camera: Camera): void
    setTilesRenderer(tilesRenderer: TilesRenderer | null): void
    attach(domElement: HTMLElement): void
    getUpDirection(point: unknown, target: Vector3): void
    getCameraUpDirection(target: Vector3): void
    getPivotPoint(target: Vector3): Vector3 | null
    detach(): void
    resetState(): void
    setState(state?: EnvironmentControlsState, fireEvent?: boolean): void
    update(deltaTime?: number): void
    adjustCamera(camera: Camera): void
    dispose(): void
  }

  export class GlobeControls extends EnvironmentControls {
    readonly ellipsoid: Ellipsoid | null
    readonly tilesGroup: TilesGroup | null

    nearMargin: number
    farMargin: number

    getVectorToCenter(target: Vector3): Vector3
    getDistanceToCenter(): number
  }
}
