import {
  ClampToEdgeWrapping,
  Data3DTexture,
  DataTexture,
  FileLoader,
  FloatType,
  HalfFloatType,
  LinearFilter,
  Loader,
  RGBAFormat,
  type Texture,
  type TypedArray
} from 'three'
import invariant from 'tiny-invariant'
import { type Constructor } from 'type-fest'

import {
  parseFloat32Array,
  parseInt16Array,
  parseUint16Array
} from './typedArray'

export interface ImageSize {
  width: number
  height: number
  depth?: number
}

export type DataTextureParameters = Omit<
  Partial<{
    [K in keyof Texture as Texture[K] extends Function ? never : K]: Texture[K]
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
  T extends DataTexture | Data3DTexture = DataTexture | Data3DTexture
> extends Loader<T> {
  abstract readonly Texture: Constructor<T>

  imageSize?: ImageSize
  parameters?: DataTextureParameters

  constructor() {
    super()
    this.parameters = { ...defaultDataTextureParameter, ...this.parameters }
  }

  abstract parseTypedArray(buffer: ArrayBuffer): TypedArray

  load(
    url: string,
    onLoad: (data: T) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (error: unknown) => void
  ): T {
    const texture = new this.Texture()
    const loader = new FileLoader(this.manager)
    loader.setResponseType('arraybuffer')
    loader.setRequestHeader(this.requestHeader)
    loader.setPath(this.path)
    loader.setWithCredentials(this.withCredentials)
    loader.load(
      url,
      buffer => {
        invariant(buffer instanceof ArrayBuffer)
        let imageData: TypedArray | undefined
        try {
          imageData = this.parseTypedArray(buffer)
        } catch (error) {
          if (onError != null) {
            onError(error)
          } else {
            console.error(error)
            return
          }
        }
        if (imageData != null) {
          texture.image.data = imageData as typeof texture.image.data
        }
        if (this.imageSize != null) {
          texture.image.width = this.imageSize.width
          texture.image.height = this.imageSize.height
          if ('depth' in texture.image && this.imageSize.depth != null) {
            texture.image.depth = this.imageSize.depth
          }
        }
        Object.assign(texture, this.parameters)
        texture.needsUpdate = true
        onLoad?.(texture)
      },
      onProgress,
      onError
    )

    return texture
  }
}

export class Int16Data2DLoader extends DataLoader {
  Texture = DataTexture
  parseTypedArray = parseInt16Array
  parameters = {
    type: HalfFloatType
  }
}

export class Uint16Data2DLoader extends DataLoader {
  Texture = DataTexture
  parseTypedArray = parseUint16Array
  parameters = {
    type: HalfFloatType
  }
}

export class Float32Data2DLoader extends DataLoader {
  Texture = DataTexture
  parseTypedArray = parseFloat32Array
  parameters = {
    type: FloatType
  }
}

export class Float32Data3DLoader extends DataLoader {
  Texture = Data3DTexture
  parseTypedArray = parseFloat32Array
  parameters = {
    type: FloatType
  }
}
