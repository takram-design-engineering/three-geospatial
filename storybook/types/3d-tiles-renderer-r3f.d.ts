declare module '3d-tiles-renderer/r3f' {
  import { type GlobeControls, type TilesRenderer } from '3d-tiles-renderer'
  import { type FC, type RefAttributes } from 'react'

  export function TilesPlugin<
    T extends new (...args: any[]) => any,
    Params extends {} = ConstructorParameters<T>[0] extends {}
      ? ConstructorParameters<T>[0]
      : {}
  >(
    props: {
      args?: Params
      plugin: T
    } & Partial<Params> &
      RefAttributes<T>
  ): JSX.Element

  export function TilesRenderer<
    T extends new (...args: any[]) => any,
    Params extends {} = ConstructorParameters<T>[0] extends {}
      ? ConstructorParameters<T>[0]
      : {}
  >(
    props: {
      url?: string
    } & Partial<Params> &
      RefAttributes<TilesRenderer>
  ): JSX.Element

  export function GlobeControls<
    T extends new (...args: any[]) => any,
    Params extends {} = ConstructorParameters<T>[0] extends {}
      ? ConstructorParameters<T>[0]
      : {}
  >(props: {} & Partial<Params> & RefAttributes<GlobeControls>): JSX.Element

  export const CameraTransition: FC<{
    mode: 'perspective' | 'orthographic'
  }>
}
