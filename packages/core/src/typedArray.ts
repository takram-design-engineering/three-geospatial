import invariant from 'tiny-invariant'

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

export type TypedArrayElementType =
  | 'int8'
  | 'uint8'
  | 'int16'
  | 'uint16'
  | 'int32'
  | 'uint32'
  | 'float32'
  | 'float64'

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
    array instanceof Float32Array ? 'float32' :
    array instanceof Float64Array ? 'float64' :
    null
  )
  invariant(type != null)
  return type
}
