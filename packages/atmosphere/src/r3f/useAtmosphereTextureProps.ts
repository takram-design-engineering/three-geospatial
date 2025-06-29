import { useLoader, useThree } from '@react-three/fiber'

import { DEFAULT_PRECOMPUTED_TEXTURES_URL } from '../constants'
import { PrecomputedTexturesLoader } from '../PrecomputedTexturesLoader'
import { type PrecomputedTextures } from '../types'

export function useAtmosphereTextureProps(
  url = DEFAULT_PRECOMPUTED_TEXTURES_URL
): { textures: PrecomputedTextures } {
  const gl = useThree(({ gl }) => gl)
  const textures = useLoader(PrecomputedTexturesLoader, url, loader => {
    loader.setTypeFromRenderer(gl)
  })
  return { textures }
}
