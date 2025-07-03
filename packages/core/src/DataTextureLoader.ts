import {
  ByteType,
  FloatType,
  HalfFloatType,
  IntType,
  LinearFilter,
  Loader,
  RGBAFormat,
  ShortType,
  UnsignedByteType,
  UnsignedIntType,
  UnsignedShortType,
  type ColorSpace,
  type Data3DTexture,
  type DataTexture,
  type LoadingManager,
  type MagnificationTextureFilter,
  type Mapping,
  type MinificationTextureFilter,
  type PixelFormat,
  type TextureDataType,
  type Wrapping
} from 'three'
import invariant from 'tiny-invariant'
import type { Class } from 'type-fest'

import { Float16Array, type TypedArray } from './typedArray'
import { TypedArrayLoader } from './TypedArrayLoader'
import type { TypedArrayParser } from './typedArrayParsers'

function getTextureDataType(array: TypedArray): TextureDataType {
  // prettier-ignore
  const type = (
    array instanceof Int8Array ? ByteType :
    array instanceof Uint8Array ? UnsignedByteType :
    array instanceof Uint8ClampedArray ? UnsignedByteType :
    array instanceof Int16Array ? ShortType :
    array instanceof Uint16Array ? UnsignedShortType :
    array instanceof Int32Array ? IntType :
    array instanceof Uint32Array ? UnsignedIntType :
    array instanceof Float16Array ? HalfFloatType :
    array instanceof Float32Array ? FloatType :
    array instanceof Float64Array ? FloatType :
    null
  )
  invariant(type != null)
  return type
}

export interface DataTextureLoaderOptions {
  width?: number
  height?: number
  depth?: number
  mapping?: Mapping
  wrapS?: Wrapping
  wrapT?: Wrapping
  wrapR?: Wrapping
  magFilter?: MagnificationTextureFilter
  minFilter?: MinificationTextureFilter
  format?: PixelFormat
  type?: TextureDataType
  anisotropy?: number
  colorSpace?: ColorSpace
  manager?: LoadingManager
}

export class DataTextureLoader<
  T extends DataTexture | Data3DTexture = DataTexture | Data3DTexture,
  U extends TypedArray = TypedArray
> extends Loader<T> {
  textureClass: Class<T>
  parser: TypedArrayParser<U>
  options: DataTextureLoaderOptions

  constructor(
    textureClass: Class<T>,
    parser: TypedArrayParser<U>,
    options: DataTextureLoaderOptions = {},
    manager?: LoadingManager
  ) {
    super(manager)
    this.textureClass = textureClass
    this.parser = parser
    this.options = {
      format: RGBAFormat,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      ...options
    }
  }

  override load(
    url: string,
    onLoad?: (data: T) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (error: unknown) => void
  ): T {
    // eslint-disable-next-line new-cap
    const texture = new this.textureClass()

    const loader = new TypedArrayLoader(this.parser, this.manager)
    loader.setRequestHeader(this.requestHeader)
    loader.setPath(this.path)
    loader.setWithCredentials(this.withCredentials)
    loader.load(
      url,
      array => {
        texture.image.data =
          array instanceof Float16Array ? new Uint16Array(array.buffer) : array
        const { width, height, depth, ...options } = this.options
        if (width != null) {
          texture.image.width = width
        }
        if (height != null) {
          texture.image.height = height
        }
        if ('depth' in texture.image && depth != null) {
          texture.image.depth = depth
        }

        // Populate the default texture type for the array type.
        texture.type = getTextureDataType(array)

        Object.assign(texture, options)
        texture.needsUpdate = true
        onLoad?.(texture)
      },
      onProgress,
      onError
    )

    return texture
  }
}
