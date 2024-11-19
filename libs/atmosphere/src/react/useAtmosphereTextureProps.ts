import { useLoader, useThree } from '@react-three/fiber'

import {
  PrecomputedTexturesLoader,
  type PrecomputedTextures
} from '../PrecomputedTexturesLoader'

export function useAtmosphereTextureProps(
  url: string,
  useHalfFloat?: boolean
): {
  textures: PrecomputedTextures
  useHalfFloat: boolean
} {
  const gl = useThree(({ gl }) => gl)
  if (useHalfFloat == null) {
    useHalfFloat =
      gl.getContext().getExtension('OES_texture_float_linear') == null
  }
  const textures = useLoader(PrecomputedTexturesLoader, url, loader => {
    loader.useHalfFloat = useHalfFloat
  })
  return {
    textures,
    useHalfFloat
  }
}
