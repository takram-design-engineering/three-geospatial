import { type ReadonlyTuple } from 'type-fest'

export function assertType<T>(value: unknown): asserts value is T {}

export function isNotNullish<T>(value: T | null | undefined): value is T {
  return value != null
}

export function isNotUndefined<T>(value: T | undefined): value is T {
  return value !== undefined
}

export function isNotFalse<T>(value: T | false): value is T {
  return value !== false
}

export type TypedArray =
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array

export type TypedArrayConstructor =
  | Int8ArrayConstructor
  | Uint8ArrayConstructor
  | Uint8ClampedArrayConstructor
  | Int16ArrayConstructor
  | Uint16ArrayConstructor
  | Int32ArrayConstructor
  | Uint32ArrayConstructor
  | Float32ArrayConstructor
  | Float64ArrayConstructor

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
