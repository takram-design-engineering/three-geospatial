import {
  type Matrix2,
  type Matrix3,
  type Matrix4,
  type Vector2,
  type Vector3,
  type Vector4
} from 'three'
import { type ReadonlyTuple } from 'type-fest'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Callable = (...args: any) => any

export type ReadonlyTuple2<T = number> = ReadonlyTuple<T, 2>
export type ReadonlyTuple3<T = number> = ReadonlyTuple<T, 3>
export type ReadonlyTuple4<T = number> = ReadonlyTuple<T, 4>

// Non-readonly version of ReadonlyTuple. This is not type-safe because mutable
// methods still exist in the type.
// See https://github.com/sindresorhus/type-fest/blob/main/source/readonly-tuple.d.ts
type BuildTupleHelper<
  Element,
  Length extends number,
  Rest extends Element[]
> = Rest['length'] extends Length
  ? [...Rest]
  : BuildTupleHelper<Element, Length, [Element, ...Rest]>

export type Tuple<T, Length extends number> = number extends Length
  ? readonly T[]
  : BuildTupleHelper<T, Length, []>

export type Tuple2<T = number> = BuildTupleHelper<T, 2, []>
export type Tuple3<T = number> = BuildTupleHelper<T, 3, []>
export type Tuple4<T = number> = BuildTupleHelper<T, 4, []>

// Suppose return type of the mutable methods of classes like Vector3 is `this`.
// TODO: How can we specify `this` as a constraint?
type ReadonlyThreeInstance<T> = Readonly<{
  [K in keyof T as T[K] extends Callable
    ? ReturnType<T[K]> extends T
      ? K extends 'clone'
        ? K
        : never
      : K
    : K]: T[K]
}>

export type ReadonlyVector2 = ReadonlyThreeInstance<Vector2>
export type ReadonlyVector3 = ReadonlyThreeInstance<Vector3>
export type ReadonlyVector4 = ReadonlyThreeInstance<Vector4>
export type ReadonlyMatrix2 = ReadonlyThreeInstance<Matrix2>
export type ReadonlyMatrix3 = ReadonlyThreeInstance<Matrix3>
export type ReadonlyMatrix4 = ReadonlyThreeInstance<Matrix4>
