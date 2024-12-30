declare module '3d-tiles-renderer/r3f' {
  import {
    type GlobeControls as GlobeControlsImpl,
    type TilesRenderer as TilesRendererImpl,
    type EnvironmentControls as EnvironmentControlsImpl,
    type CameraTransitionManager,
    type CameraTransitionMode
  } from '3d-tiles-renderer'
  import { type GroupProps } from '@react-three/fiber'
  import {
    type OrthographicCamera,
    type PerspectiveCamera,
    type Camera,
    type Object3D
  } from 'three'
  import {
    type ReactNode,
    type Context,
    type FC,
    type RefAttributes
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
  >(
    props: TilesPluginProps<Plugin, Params> & RefAttributes<Plugin>
  ): JSX.Element

  export type TilesRendererProps = {
    url?: string
    group?: GroupProps
    children?: ReactNode
  } & Partial<TilesRendererImpl>

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
}
