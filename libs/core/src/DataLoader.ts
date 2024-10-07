import {
  ClampToEdgeWrapping,
  Data3DTexture,
  DataTexture,
  FileLoader,
  FloatType,
  LinearFilter,
  Loader,
  RGBAFormat,
  type TypedArray
} from 'three'
import invariant from 'tiny-invariant'
import { type Constructor } from 'type-fest'

import { parseFloat32Array } from './typedArray'

export interface ImageSize {
  width: number
  height: number
  depth?: number
}

export abstract class DataLoader<
  T extends DataTexture | Data3DTexture = DataTexture | Data3DTexture
> extends Loader<T> {
  abstract readonly Texture: Constructor<T>

  imageSize?: ImageSize

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
          imageData = parseFloat32Array(buffer)
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
        texture.format = RGBAFormat
        texture.type = FloatType
        texture.wrapS = ClampToEdgeWrapping
        texture.wrapT = ClampToEdgeWrapping
        texture.minFilter = LinearFilter
        texture.magFilter = LinearFilter
        texture.needsUpdate = true
        onLoad?.(texture)
      },
      onProgress,
      onError
    )

    return texture
  }
}

export class Data2DLoader extends DataLoader {
  readonly Texture = DataTexture
}

export class Data3DLoader extends DataLoader {
  readonly Texture = Data3DTexture
}
