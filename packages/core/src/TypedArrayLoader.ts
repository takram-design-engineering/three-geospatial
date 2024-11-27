import { Loader, type TypedArray } from 'three'

import { ArrayBufferLoader } from './ArrayBufferLoader'
import {
  parseFloat32Array,
  parseInt16Array,
  parseUint16Array
} from './typedArray'

export abstract class TypedArrayLoader<T extends TypedArray> extends Loader<T> {
  abstract parseTypedArray(buffer: ArrayBuffer): T

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
          onLoad(this.parseTypedArray(arrayBuffer))
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

export class Int16ArrayLoader extends TypedArrayLoader<Int16Array> {
  readonly parseTypedArray = parseInt16Array
}

export class Uint16ArrayLoader extends TypedArrayLoader<Uint16Array> {
  readonly parseTypedArray = parseUint16Array
}

export class Float32ArrayLoader extends TypedArrayLoader<Float32Array> {
  readonly parseTypedArray = parseFloat32Array
}
