import {
  ClampToEdgeWrapping,
  Data3DTexture,
  DataTexture,
  FloatType,
  LinearFilter,
  Loader,
  RGBAFormat,
  type Texture,
  type TypedArray
} from 'three'
import { type Class } from 'type-fest'

import {
  Float32ArrayLoader,
  Int16ArrayLoader,
  Uint16ArrayLoader,
  type TypedArrayLoader
} from './TypedArrayLoader'
import { type Callable } from './types'

export interface ImageSize {
  width: number
  height: number
  depth?: number
}

export type DataTextureParameters = Omit<
  Partial<{
    [K in keyof Texture as Texture[K] extends Callable ? never : K]: Texture[K]
  }>,
  'image'
>

const defaultDataTextureParameter = {
  format: RGBAFormat,
  wrapS: ClampToEdgeWrapping,
  wrapT: ClampToEdgeWrapping,
  minFilter: LinearFilter,
  magFilter: LinearFilter
} satisfies DataTextureParameters

export abstract class DataLoader<
  T extends DataTexture | Data3DTexture,
  U extends TypedArray
> extends Loader<T> {
  abstract readonly Texture: Class<T>
  abstract readonly TypedArrayLoader: Class<TypedArrayLoader<U>>

  readonly parameters?: DataTextureParameters

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
        Object.assign(texture, this.parameters)
        texture.needsUpdate = true
        onLoad(texture)
      },
      onProgress,
      onError
    )
  }
}

export class Int16Data2DLoader extends DataLoader<DataTexture, Int16Array> {
  readonly Texture = DataTexture
  readonly TypedArrayLoader = Int16ArrayLoader
  readonly parameters = {
    ...defaultDataTextureParameter,
    type: FloatType
  } satisfies DataTextureParameters
}

export class Uint16Data2DLoader extends DataLoader<DataTexture, Uint16Array> {
  readonly Texture = DataTexture
  readonly TypedArrayLoader = Uint16ArrayLoader
  readonly parameters = {
    ...defaultDataTextureParameter,
    type: FloatType
  } satisfies DataTextureParameters
}

export class Float32Data2DLoader extends DataLoader<DataTexture, Float32Array> {
  readonly Texture = DataTexture
  readonly TypedArrayLoader = Float32ArrayLoader
  readonly parameters = {
    ...defaultDataTextureParameter,
    type: FloatType
  } satisfies DataTextureParameters
}

export class Float32Data3DLoader extends DataLoader<
  Data3DTexture,
  Float32Array
> {
  readonly Texture = Data3DTexture
  readonly TypedArrayLoader = Float32ArrayLoader
  readonly parameters = {
    ...defaultDataTextureParameter,
    type: FloatType
  } satisfies DataTextureParameters
}
