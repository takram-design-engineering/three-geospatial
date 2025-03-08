import { useLoader } from '@react-three/fiber'

import { DEFAULT_PRECOMPUTED_TEXTURES_URL } from '../constants'
import {
  PrecomputedTexturesLoader,
  type PrecomputedTextures
} from '../PrecomputedTexturesLoader'

export function useAtmosphereTextureProps(
  url = DEFAULT_PRECOMPUTED_TEXTURES_URL
): { textures: PrecomputedTextures } {
  const textures = useLoader(PrecomputedTexturesLoader, url)
  return { textures }
}
