import { Loader, type LoadingManager } from 'three'

import { ArrayBufferLoader } from './ArrayBufferLoader'
import type { TypedArray } from './typedArray'
import type { TypedArrayParser } from './typedArrayParsers'

export class TypedArrayLoader<T extends TypedArray> extends Loader<T> {
  parser: TypedArrayParser<T>

  constructor(parser: TypedArrayParser<T>, manager?: LoadingManager) {
    super(manager)
    this.parser = parser
  }

  override load(
    url: string,
    onLoad: (data: T) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (error: unknown) => void
  ): void {
    const loader = new ArrayBufferLoader(this.manager)
    loader.setRequestHeader(this.requestHeader)
    loader.setPath(this.path)
    loader.setWithCredentials(this.withCredentials)
    loader.load(
      url,
      arrayBuffer => {
        try {
          onLoad(this.parser(arrayBuffer))
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
