import { type ReadonlyTuple } from 'type-fest'

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
