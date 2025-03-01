import { Loader } from 'three'
import { type Class } from 'type-fest'

import { ArrayBufferLoader } from './ArrayBufferLoader'
import { type TypedArray } from './typedArray'
import {
  parseFloat32Array,
  parseInt16Array,
  parseUint16Array,
  type TypedArrayParser
} from './typedArrayParsers'

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

export function createTypedArrayLoaderClass<T extends TypedArray>(
  parser: TypedArrayParser<T>
): Class<TypedArrayLoader<T>> {
  return class extends TypedArrayLoader<T> {
    readonly parseTypedArray = parser
  }
}

export function createTypedArrayLoader<T extends TypedArray>(
  parser: TypedArrayParser<T>
): TypedArrayLoader<T> {
  return new (createTypedArrayLoaderClass(parser))()
}

/** @deprecated Use createTypedArrayLoaderClass instead. */
export const Int16ArrayLoader =
  /*#__PURE__*/ createTypedArrayLoaderClass(parseInt16Array)

/** @deprecated Use createTypedArrayLoaderClass instead. */
export const Uint16ArrayLoader =
  /*#__PURE__*/ createTypedArrayLoaderClass(parseUint16Array)

/** @deprecated Use createTypedArrayLoaderClass instead. */
export const Float32ArrayLoader =
  /*#__PURE__*/ createTypedArrayLoaderClass(parseFloat32Array)
