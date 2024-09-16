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
