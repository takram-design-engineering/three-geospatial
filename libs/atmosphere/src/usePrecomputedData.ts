import { useLoader } from '@react-three/fiber'
import { type Data3DTexture, type DataTexture } from 'three'

import {
  assertType,
  Float32Data2DLoader,
  Float32Data3DLoader,
  type DataLoader,
  type ImageSize
} from '@geovanni/core'

export function usePrecomputedData(
  path: string,
  imageSize: Omit<ImageSize, 'depth'>,
  useHalfFloat?: boolean
): DataTexture

export function usePrecomputedData(
  path: string,
  imageSize: Required<ImageSize>,
  useHalfFloat?: boolean
): Data3DTexture

export function usePrecomputedData(
  path: string,
  imageSize: ImageSize,
  useHalfFloat?: boolean
): DataTexture | Data3DTexture

export function usePrecomputedData(
  path: string,
  imageSize: ImageSize,
  useHalfFloat = true
): DataTexture | Data3DTexture {
  return useLoader(
    imageSize.depth != null ? Float32Data3DLoader : Float32Data2DLoader,
    path.replace('.bin', useHalfFloat ? '.bin' : '_float.bin'),
    loader => {
      assertType<DataLoader>(loader)
      loader.imageSize = imageSize
    }
  )
}
