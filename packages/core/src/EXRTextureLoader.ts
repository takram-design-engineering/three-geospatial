import { DataTexture, Loader, type LoadingManager } from 'three'
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js'

export interface EXRTextureLoaderOptions {
  width?: number
  height?: number
}

export class EXRTextureLoader extends Loader<DataTexture> {
  options: EXRTextureLoaderOptions

  constructor(options: EXRTextureLoaderOptions = {}, manager?: LoadingManager) {
    super(manager)
    this.options = options
  }

  override load(
    url: string,
    onLoad?: (data: DataTexture) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (error: unknown) => void
  ): DataTexture {
    const { width, height } = this.options
    const texture = new DataTexture(null, width, height)

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
          height: height ?? image.height
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
