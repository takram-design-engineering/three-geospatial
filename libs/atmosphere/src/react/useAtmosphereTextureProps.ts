import { useLoader, useThree } from '@react-three/fiber'
import { useMemo } from 'react'

import {
  PrecomputedTexturesLoader,
  type PrecomputedTextures
} from '../PrecomputedTexturesLoader'

export function useAtmosphereTextureProps(url: string): {
  textures: PrecomputedTextures
  useHalfFloat: boolean
} {
  const gl = useThree(({ gl }) => gl)
  const useHalfFloat = useMemo(
    () => gl.getContext().getExtension('OES_texture_float_linear') == null,
    [gl]
  )
  const textures = useLoader(PrecomputedTexturesLoader, url, loader => {
    loader.useHalfFloat = useHalfFloat
  })
  return {
    textures,
    useHalfFloat
  }
}
