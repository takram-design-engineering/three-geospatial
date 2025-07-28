declare module '3d-tiles-renderer/r3f' {
  import type {
    GlobeControls as GlobeControlsImpl,
    TilesRenderer as TilesRendererImpl,
    EnvironmentControls as EnvironmentControlsImpl,
    CameraTransitionManager,
    CameraTransitionMode
  } from '3d-tiles-renderer'
  import type { GroupProps } from '@react-three/fiber'
  import type {
    OrthographicCamera,
    PerspectiveCamera,
    Camera,
    Object3D
  } from 'three'
  import type React from 'react'
  import type {
    ReactNode,
    Context,
    FC,
    RefAttributes,
    ComponentProps
  } from 'react'

  export const TilesRendererContext: Context<TilesRendererImpl | null>

  export interface EastNorthUpFrameProps {
    lat?: number
    lon?: number
    height?: number
    az?: number
    el?: number
    roll?: number
    children?: ReactNode
  }

  export const EastNorthUpFrame: FC<EastNorthUpFrameProps>

  export type TilesPluginProps<
    Plugin extends new (...args: any[]) => any,
    Params extends {} = ConstructorParameters<Plugin>[0] extends {}
      ? ConstructorParameters<Plugin>[0]
      : {}
  > = Partial<Params> & {
    plugin: Plugin
    args?: Params | [Params]
  }

  export function TilesPlugin<
    Plugin extends new (...args: any[]) => any,
    Params extends {} = ConstructorParameters<Plugin>[0] extends {}
      ? ConstructorParameters<Plugin>[0]
      : {}
  >(props: TilesPluginProps<Plugin, Params>): React.JSX.Element

  export interface TilesRendererProps extends Partial<TilesRendererImpl> {
    url?: string
    group?: GroupProps
    children?: ReactNode
  }

  export const TilesRenderer: FC<
    TilesRendererProps & RefAttributes<TilesRendererImpl>
  >

  interface ControlsBaseComponentProps {
    domElement?: HTMLCanvasElement | null
    scene?: Object3D | null
    camera?: Camera | null
    tilesRenderer?: TilesRendererImpl | null
  }

  export interface EnvironmentControlsProps
    extends ControlsBaseComponentProps,
      Partial<EnvironmentControlsImpl> {}

  export const EnvironmentControls: FC<
    EnvironmentControlsProps & RefAttributes<EnvironmentControlsImpl>
  >

  export interface GlobeControlsProps
    extends ControlsBaseComponentProps,
      Partial<GlobeControlsImpl> {}

  export const GlobeControls: FC<
    GlobeControlsProps & RefAttributes<GlobeControlsImpl>
  >

  export interface CameraTransitionProps
    extends Partial<InstanceType<CameraTransitionManager>> {
    mode?: CameraTransitionMode
    perspectiveCamera?: PerspectiveCamera
    orthographicCamera?: OrthographicCamera
  }

  export const CameraTransition: FC<
    CameraTransitionProps & RefAttributes<CameraTransitionManager>
  >

  export interface CanvasDOMOverlayProps extends ComponentProps<'div'> {}

  export const CanvasDOMOverlay: FC<
    CanvasDOMOverlayProps & RefAttributes<'div'>
  >

  export interface TilesAttributionOverlayProps extends CanvasDOMOverlayPProps {
    generateAttributions?:
      | ((attribution: Array<{ type: string; value: any }>) => ReactNode)
      | null
  }

  export const TilesAttributionOverlay: FC<TilesAttributionOverlayProps>
}
