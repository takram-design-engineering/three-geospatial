import {
  Data3DTexture,
  ImageLoader,
  LinearFilter,
  Loader,
  RepeatWrapping
} from 'three'

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

        // Assume cubic 3D texture.
        const { width, height } = image
        const size = Math.min(width, height)
        canvas.width = width
        canvas.height = height
        context.drawImage(image, 0, 0)
        const imageData = context.getImageData(0, 0, width, height).data
        let data: Uint8Array

        if (width < height) {
          data = new Uint8Array(imageData.buffer)
        } else {
          data = new Uint8Array(imageData.length)
          const sizeSq = size ** 2
          for (let z = 0; z < size; ++z) {
            for (let y = 0; y < size; ++y) {
              for (let x = 0; x < size; ++x) {
                const src = (x + z * size + y * sizeSq) * 4
                const dest = (x + y * size + z * sizeSq) * 4
                data[dest + 0] = imageData[src + 0]
                data[dest + 1] = imageData[src + 1]
                data[dest + 2] = imageData[src + 2]
                data[dest + 3] = imageData[src + 3]
              }
            }
          }
        }

        const texture = new Data3DTexture(data, size, size, size)
        texture.minFilter = LinearFilter
        texture.magFilter = LinearFilter
        texture.wrapS = RepeatWrapping
        texture.wrapT = RepeatWrapping
        texture.wrapR = RepeatWrapping
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
