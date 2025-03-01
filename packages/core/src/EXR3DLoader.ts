import { Data3DTexture, Loader } from 'three'
import { EXRLoader } from 'three-stdlib'

export class EXR3DLoader extends Loader<Data3DTexture> {
  depth?: number

  setDepth(value: number): this {
    this.depth = value
    return this
  }

  override load(
    url: string,
    onLoad: (data: Data3DTexture) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (error: unknown) => void
  ): void {
    const loader = new EXRLoader(this.manager)
    loader.setRequestHeader(this.requestHeader)
    loader.setPath(this.path)
    loader.setWithCredentials(this.withCredentials)
    loader.load(
      url,
      exr => {
        const { data, width, height } = exr.image
        const depth = this.depth ?? Math.sqrt(height)
        const texture = new Data3DTexture(data, width, height / depth, depth)
        texture.type = exr.type
        texture.format = exr.format
        texture.colorSpace = exr.colorSpace
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
