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

type GetValue = keyof {
  [K in keyof DataView as DataView[K] extends (byteOffset: number) => number
    ? K
    : never]: DataView[K]
}

export function parseTypedArray<
  T extends TypedArrayConstructor,
  K extends GetValue
>(
  buffer: ArrayBuffer,
  TypedArray: T,
  getValue: K,
  littleEndian?: boolean
): InstanceType<T>

export function parseTypedArray<K extends GetValue>(
  buffer: ArrayBuffer,
  TypedArray: TypedArrayConstructor,
  getValue: K,
  littleEndian = true
): TypedArray {
  const data = new DataView(buffer)
  const array = new TypedArray(data.byteLength / TypedArray.BYTES_PER_ELEMENT)
  for (
    let index = 0, byteIndex = 0;
    index < array.length;
    ++index, byteIndex += TypedArray.BYTES_PER_ELEMENT
  ) {
    array[index] = data[getValue](byteIndex, littleEndian)
  }
  return array
}

export function parseInt16Array(
  buffer: ArrayBuffer,
  littleEndian?: boolean
): Int16Array {
  return parseTypedArray(buffer, Int16Array, 'getInt16', littleEndian)
}

export function parseUint16Array(
  buffer: ArrayBuffer,
  littleEndian?: boolean
): Uint16Array {
  return parseTypedArray(buffer, Uint16Array, 'getUint16', littleEndian)
}

export function parseFloat32Array(
  buffer: ArrayBuffer,
  littleEndian?: boolean
): Float32Array {
  return parseTypedArray(buffer, Float32Array, 'getFloat32', littleEndian)
}
