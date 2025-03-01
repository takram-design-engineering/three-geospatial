import {
  Float16Array,
  type Float16ArrayConstructor
} from '@petamoriken/float16'
import invariant from 'tiny-invariant'

export type TypedArray =
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float16Array
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
  | Float16ArrayConstructor
  | Float32ArrayConstructor
  | Float64ArrayConstructor

/** @deprecated */
export type TypedArrayElementType =
  | 'int8'
  | 'uint8'
  | 'int16'
  | 'uint16'
  | 'int32'
  | 'uint32'
  | 'float16'
  | 'float32'
  | 'float64'

/** @deprecated Use getTypedArrayTextureDataType instead */
export function getTypedArrayElementType(
  array: TypedArray
): TypedArrayElementType {
  // prettier-ignore
  const type = (
    array instanceof Int8Array ? 'int8' :
    array instanceof Uint8Array ? 'uint8' :
    array instanceof Uint8ClampedArray ? 'uint8' :
    array instanceof Int16Array ? 'int16' :
    array instanceof Uint16Array ? 'uint16' :
    array instanceof Int32Array ? 'int32' :
    array instanceof Uint32Array ? 'uint32' :
    array instanceof Float16Array ? 'float16' :
    array instanceof Float32Array ? 'float32' :
    array instanceof Float64Array ? 'float64' :
    null
  )
  invariant(type != null)
  return type
}

export function isTypedArray(value: unknown): value is TypedArray {
  return (
    value instanceof Int8Array ||
    value instanceof Uint8Array ||
    value instanceof Uint8ClampedArray ||
    value instanceof Int16Array ||
    value instanceof Uint16Array ||
    value instanceof Int32Array ||
    value instanceof Uint32Array ||
    value instanceof Float16Array ||
    value instanceof Float32Array ||
    value instanceof Float64Array
  )
}

export { Float16Array }
