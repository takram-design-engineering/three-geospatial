import {
  type Color,
  type ExtendedColors,
  type NodeProps,
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
import { type WritableKeysOf } from 'type-fest'

import { type Callable } from '../types'

// prettier-ignore
export type ExtendedVectors<T> = {
  [K in keyof T]:
    Vector2Impl extends T[K] ? Vector2 | T[K] :
    Vector3Impl extends T[K] ? Vector3 | T[K] :
    Vector4Impl extends T[K] ? Vector4 | T[K] :
    T[K]
}

export type ExtendedProps<T> = ExtendedColors<ExtendedVectors<T>>

// @react-three/fiber's NonFunctionKeys cannot exclude partial functions.
// This excludes callback properties, which may be undesirable behavior.
type NonFunctionKeys<T> = keyof {
  [K in keyof T as Callable extends T[K] ? never : K]: any
}

// prettier-ignore
type WritableNonExtendableKeysOf<T> =
  | WritableKeysOf<T>
  | keyof {
      [K in keyof T as
        Vector2Impl extends T[K] ? K :
        Vector3Impl extends T[K] ? K :
        Vector4Impl extends T[K] ? K :
        Color extends T[K] ? K :
        never
      ]: any
    }

export type PassThoughInstanceProps<
  RefType,
  Args extends readonly any[],
  Props
> = Overwrite<
  ExtendedProps<{
    [K in NonFunctionKeys<Props> as K extends WritableNonExtendableKeysOf<Props>
      ? K
      : never]: Props[K]
  }>,
  NodeProps<RefType, Args>
>

export type ExpandNestedProps<T, Prop extends keyof T & string> = {
  [K in keyof T[Prop] as K extends string ? `${Prop}-${K}` : never]: T[Prop][K]
}
