import {
  type ExtendedColors,
  type NodeProps,
  type NonFunctionKeys,
  type Overwrite,
  type Vector2,
  type Vector3,
  type Vector4
} from '@react-three/fiber'
import {
  type Vector2 as Vector2Impl,
  type Vector3 as Vector3Impl,
  type Vector4 as Vector4Impl
} from 'three'

export type ExtendedVectors<T> = {
  [K in keyof T]: Vector2Impl extends T[K]
    ? Vector2 | T[K]
    : Vector3Impl extends T[K]
      ? Vector3 | T[K]
      : Vector4Impl extends T[K]
        ? Vector4 | T[K]
        : T[K]
}

export type ExtendedProps<T> = ExtendedColors<ExtendedVectors<T>>

export type PassThoughInstanceProps<
  RefType,
  Args extends readonly any[],
  Props
> = Overwrite<
  ExtendedProps<{
    [K in NonFunctionKeys<Props>]?: Props[K]
  }>,
  NodeProps<RefType, Args>
>

export type ExpandNestedProps<
  T,
  Prop extends keyof T & string
> = ExtendedProps<{
  [K in NonFunctionKeys<T[Prop]> as K extends string
    ? `${Prop}-${K}`
    : never]?: T[Prop][K]
}>
