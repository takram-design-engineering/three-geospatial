import { FileLoader, Loader } from 'three'
import invariant from 'tiny-invariant'

export class ArrayBufferLoader extends Loader<ArrayBuffer> {
  override load(
    url: string,
    onLoad: (data: ArrayBuffer) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (error: unknown) => void
  ): void {
    const loader = new FileLoader(this.manager)
    loader.setResponseType('arraybuffer')
    loader.setRequestHeader(this.requestHeader)
    loader.setPath(this.path)
    loader.setWithCredentials(this.withCredentials)
    loader.load(
      url,
      arrayBuffer => {
        invariant(arrayBuffer instanceof ArrayBuffer)
        try {
          onLoad(arrayBuffer)
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
