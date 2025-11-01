import { Data3DTexture, Loader, type LoadingManager } from 'three'
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js'

export interface EXR3DTextureLoaderOptions {
  width?: number
  height?: number
  depth?: number
}

export class EXR3DTextureLoader extends Loader<Data3DTexture> {
  options: EXR3DTextureLoaderOptions

  constructor(
    options: EXR3DTextureLoaderOptions = {},
    manager?: LoadingManager
  ) {
    super(manager)
    this.options = options
  }

  override load(
    url: string,
    onLoad?: (data: Data3DTexture) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (error: unknown) => void
  ): Data3DTexture {
    const { width, height, depth } = this.options
    const texture = new Data3DTexture(null, width, height, depth)

    const loader = new EXRLoader(this.manager)
    loader.setRequestHeader(this.requestHeader)
    loader.setPath(this.path)
    loader.setWithCredentials(this.withCredentials)
    loader.load(
      url,
      exr => {
        const { image } = exr
        texture.image = {
          data: image.data,
          width: width ?? image.width,
          height: height ?? image.height,
          depth: depth ?? Math.sqrt(image.height)
        }
        texture.type = exr.type
        texture.format = exr.format
        texture.colorSpace = exr.colorSpace
        texture.needsUpdate = true

        try {
          onLoad?.(texture)
        } catch (error) {
          if (onError != null) {
            onError(error)
          } else {
            console.error(error)
          }
          this.manager.itemError(url)
        }
      },
      onProgress,
      onError
    )

    return texture
  }
}
