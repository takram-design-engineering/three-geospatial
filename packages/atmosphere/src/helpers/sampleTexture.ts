import {
  HalfFloatType,
  Vector3,
  type DataTextureImageData,
  type Texture,
  type Vector2
} from 'three'

import {
  clamp,
  Float16Array,
  isTypedArray,
  reinterpretType,
  type TypedArray
} from '@takram/three-geospatial'

const vectorScratch1 = /*#__PURE__*/ new Vector3()
const vectorScratch2 = /*#__PURE__*/ new Vector3()
const vectorScratch3 = /*#__PURE__*/ new Vector3()

const float16ArrayCache = /*#__PURE__*/ new WeakMap<
  ArrayBufferLike,
  Float16Array
>()

function getImageData(texture: Texture): TypedArray | undefined {
  // Image data is stored in the userData in case of normal texture.
  // See PrecomputedTexturesGenerator.
  reinterpretType<DataTextureImageData>(texture.image)
  let data: TypedArray | undefined = isTypedArray(texture.image.data)
    ? texture.image.data
    : isTypedArray(texture.userData.imageData)
      ? texture.userData.imageData
      : undefined

  // Prevent Float16Array instance from being created in every frame.
  if (texture.type === HalfFloatType && data instanceof Uint16Array) {
    const cache = float16ArrayCache.get(data.buffer)
    if (cache == null) {
      data = new Float16Array(data.buffer)
      float16ArrayCache.set(data.buffer, data)
    } else {
      data = cache
    }
  }
  return data
}

function samplePixel(
  data: TypedArray,
  index: number,
  result: Vector3
): Vector3 {
  const dataIndex = index * 4 // Assume RGBA
  return result.set(data[dataIndex], data[dataIndex + 1], data[dataIndex + 2])
}

export function sampleTexture(
  texture: Texture,
  uv: Vector2,
  result: Vector3
): Vector3 {
  const data = getImageData(texture)
  if (data == null) {
    return result.setScalar(0)
  }
  reinterpretType<DataTextureImageData>(texture.image)
  const { width, height } = texture.image
  const x = clamp(uv.x, 0, 1) * (width - 1)
  const y = clamp(uv.y, 0, 1) * (height - 1)
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const tx = x - xi
  const ty = y - yi
  const sx = tx
  const sy = ty
  const rx0 = xi % width
  const rx1 = (rx0 + 1) % width
  const ry0 = yi % height
  const ry1 = (ry0 + 1) % height
  const v00 = samplePixel(data, ry0 * width + rx0, vectorScratch1)
  const v10 = samplePixel(data, ry0 * width + rx1, vectorScratch2)
  const nx0 = v00.lerp(v10, sx)
  const v01 = samplePixel(data, ry1 * width + rx0, vectorScratch2)
  const v11 = samplePixel(data, ry1 * width + rx1, vectorScratch3)
  const nx1 = v01.lerp(v11, sx)
  return result.copy(nx0.lerp(nx1, sy))
}
