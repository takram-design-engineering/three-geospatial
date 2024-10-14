import { useLoader } from '@react-three/fiber'
import { type Data3DTexture, type DataTexture } from 'three'
import { type SetRequired } from 'type-fest'

import {
  Float32Data2DLoader,
  Float32Data3DLoader,
  type ImageSize
} from '@geovanni/core'

interface PrecomputedDataParams extends ImageSize {
  useHalfFloat?: boolean
}

export function usePrecomputedData(
  path: string,
  params: Omit<PrecomputedDataParams, 'depth'>
): DataTexture

export function usePrecomputedData(
  path: string,
  params: SetRequired<PrecomputedDataParams, 'depth'>
): Data3DTexture

export function usePrecomputedData(
  path: string,
  params: PrecomputedDataParams
): DataTexture | Data3DTexture

export function usePrecomputedData(
  path: string,
  { width, height, depth, useHalfFloat = false }: PrecomputedDataParams
): DataTexture | Data3DTexture {
  const texture = useLoader(
    depth != null ? Float32Data3DLoader : Float32Data2DLoader,
    path.replace('.bin', useHalfFloat ? '.bin' : '_float.bin')
  )
  texture.image.width = width
  texture.image.height = height
  if ('depth' in texture.image && depth != null) {
    texture.image.depth = depth
  }
  if (useHalfFloat) {
    texture.internalFormat = 'RGBA16F'
  }
  return texture
}
