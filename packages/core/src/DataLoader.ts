import {
  ByteType,
  ClampToEdgeWrapping,
  Data3DTexture,
  DataTexture,
  FloatType,
  LinearFilter,
  Loader,
  RGBAFormat,
  UnsignedByteType,
  type TypedArray
} from 'three'
import { type Class, type WritableKeysOf } from 'type-fest'

import { getTypedArrayElementType } from './typedArray'
import {
  createTypedArrayLoaderClass,
  type TypedArrayLoader
} from './TypedArrayLoader'
import {
  parseFloat32Array,
  parseInt16Array,
  parseUint16Array,
  type TypedArrayParser
} from './typedArrayParsers'
import { type Callable } from './types'

type ParameterProperties<T> = {
  [K in WritableKeysOf<T> as T[K] extends Callable ? never : K]: T[K]
}

export type DataTextureParameters = Omit<
  Partial<ParameterProperties<DataTexture>>,
  'image'
> & {
  width?: number
  height?: number
}

export type Data3DTextureParameters = Omit<
  Partial<ParameterProperties<Data3DTexture>>,
  'image'
> & {
  width?: number
  height?: number
  depth?: number
}

const defaultDataTextureParameter = {
  format: RGBAFormat,
  wrapS: ClampToEdgeWrapping,
  wrapT: ClampToEdgeWrapping,
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
        texture.image.data = array as typeof texture.image.data
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
        const type = getTypedArrayElementType(array)
        texture.type =
          type === 'uint8'
            ? UnsignedByteType
            : type === 'int8'
              ? ByteType
              : FloatType

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

/** @deprecated Use createDataTextureLoaderClass instead. */
export const Int16Data2DLoader =
  /*#__PURE__*/ createDataTextureLoaderClass(parseInt16Array)

/** @deprecated Use createDataTextureLoaderClass instead. */
export const Uint16Data2DLoader =
  /*#__PURE__*/ createDataTextureLoaderClass(parseUint16Array)

/** @deprecated Use createDataTextureLoaderClass instead. */
export const Float32Data2DLoader =
  /*#__PURE__*/ createDataTextureLoaderClass(parseFloat32Array)

/** @deprecated Use createData3DTextureLoaderClass instead. */
export const Float32Data3DLoader =
  /*#__PURE__*/ createData3DTextureLoaderClass(parseFloat32Array)
