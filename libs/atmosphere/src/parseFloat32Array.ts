export function parseFloat32Array(buffer: ArrayBuffer): Float32Array {
  const data = new DataView(buffer)
  const array = new Float32Array(
    data.byteLength / Float32Array.BYTES_PER_ELEMENT
  )
  for (
    let index = 0, byteIndex = 0;
    index < array.length;
    ++index, byteIndex += Float32Array.BYTES_PER_ELEMENT
  ) {
    array[index] = data.getFloat32(byteIndex, true)
  }
  return array
}
