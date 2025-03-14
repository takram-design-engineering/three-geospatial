import { useLoader, useThree } from '@react-three/fiber'

import { DEFAULT_PRECOMPUTED_TEXTURES_URL } from '../constants'
import {
  PrecomputedTexturesLoader,
  type PrecomputedTextures
} from '../PrecomputedTexturesLoader'

export function useAtmosphereTextureProps(
  url = DEFAULT_PRECOMPUTED_TEXTURES_URL,
  /** @deprecated useHalfFloat is now always true */
  useHalfFloat?: boolean
): { textures: PrecomputedTextures } {
  const gl = useThree(({ gl }) => gl)
  const textures = useLoader(PrecomputedTexturesLoader, url, loader => {
    loader.setTypeFromRenderer(gl)
  })
  return { textures }
}
