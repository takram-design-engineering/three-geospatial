import { Data3DTexture, ImageLoader, LinearFilter, Loader } from 'three'

export class Texture3DLoader extends Loader<Data3DTexture> {
  override load(
    url: string,
    onLoad: (data: Data3DTexture) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (error: unknown) => void
  ): void {
    const loader = new ImageLoader(this.manager)
    loader.setRequestHeader(this.requestHeader)
    loader.setPath(this.path)
    loader.setWithCredentials(this.withCredentials)
    loader.load(
      url,
      image => {
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')
        if (context == null) {
          onError?.(new Error('Could not obtain canvas context.'))
          return
        }
        const { width, height } = image
        const size = Math.min(width, height)
        canvas.width = width
        canvas.height = height
        context.drawImage(image, 0, 0)
        const data = context.getImageData(0, 0, width, height).data
        const texture = new Data3DTexture(data, size, size, size)
        texture.minFilter = LinearFilter
        texture.magFilter = LinearFilter
        texture.needsUpdate = true

        try {
          onLoad(texture)
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
  }
}
