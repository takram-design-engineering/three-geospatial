import {
  ByteType,
  Data3DTexture,
  DataTexture,
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
  type TextureDataType
} from 'three'
import invariant from 'tiny-invariant'
import { type Class, type WritableKeysOf } from 'type-fest'

import { Float16Array, type TypedArray } from './typedArray'
import {
  createTypedArrayLoaderClass,
  type TypedArrayLoader
} from './TypedArrayLoader'
import { type TypedArrayParser } from './typedArrayParsers'
import { type Callable } from './types'

// TODO: Move to types
type ParameterProperties<T> = {
  [K in WritableKeysOf<T> as T[K] extends Callable ? never : K]: T[K]
}

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

export interface DataTextureParameters
  extends Omit<Partial<ParameterProperties<DataTexture>>, 'image'> {
  width?: number
  height?: number
}

export interface Data3DTextureParameters
  extends Omit<Partial<ParameterProperties<Data3DTexture>>, 'image'> {
  width?: number
  height?: number
  depth?: number
}

const defaultDataTextureParameter = {
  format: RGBAFormat,
  minFilter: LinearFilter,
  magFilter: LinearFilter
} satisfies DataTextureParameters & Data3DTextureParameters

export abstract class DataLoader<
  T extends DataTexture | Data3DTexture = DataTexture | Data3DTexture,
  U extends TypedArray = TypedArray
> extends Loader<T> {
  abstract readonly Texture: Class<T>
  abstract readonly TypedArrayLoader: Class<TypedArrayLoader<U>>

  readonly parameters: DataTextureParameters & Data3DTextureParameters = {}

  override load(
    url: string,
    onLoad: (data: T) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (error: unknown) => void
  ): void {
    const texture = new this.Texture()
    const loader = new this.TypedArrayLoader(this.manager)
    loader.setRequestHeader(this.requestHeader)
    loader.setPath(this.path)
    loader.setWithCredentials(this.withCredentials)
    loader.load(
      url,
      array => {
        texture.image.data =
          array instanceof Float16Array ? new Uint16Array(array.buffer) : array
        const { width, height, depth, ...params } = this.parameters
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

        Object.assign(texture, params)
        texture.needsUpdate = true
        onLoad(texture)
      },
      onProgress,
      onError
    )
  }
}

function createDataLoaderClass<
  T extends DataTexture | Data3DTexture,
  U extends TypedArray
>(
  Texture: Class<T>,
  parser: TypedArrayParser<U>,
  parameters?: DataTextureParameters
): Class<DataLoader<T, U>> {
  return class extends DataLoader<T, U> {
    readonly Texture = Texture
    readonly TypedArrayLoader = createTypedArrayLoaderClass(parser)
    readonly parameters = {
      ...defaultDataTextureParameter,
      ...parameters
    }
  }
}

export function createData3DTextureLoaderClass<T extends TypedArray>(
  parser: TypedArrayParser<T>,
  parameters?: Data3DTextureParameters
): Class<DataLoader<Data3DTexture, T>> {
  return createDataLoaderClass(Data3DTexture, parser, parameters)
}

export function createDataTextureLoaderClass<T extends TypedArray>(
  parser: TypedArrayParser<T>,
  parameters?: DataTextureParameters
): Class<DataLoader<DataTexture, T>> {
  return createDataLoaderClass(DataTexture, parser, parameters)
}

export function createData3DTextureLoader<T extends TypedArray>(
  parser: TypedArrayParser<T>,
  parameters?: Data3DTextureParameters
): DataLoader<Data3DTexture, T> {
  return new (createData3DTextureLoaderClass(parser, parameters))()
}

export function createDataTextureLoader<T extends TypedArray>(
  parser: TypedArrayParser<T>,
  parameters?: DataTextureParameters
): DataLoader<DataTexture, T> {
  return new (createDataTextureLoaderClass(parser, parameters))()
}
