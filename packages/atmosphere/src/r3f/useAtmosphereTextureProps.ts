import { useLoader, useThree } from '@react-three/fiber'

import { DEFAULT_PRECOMPUTED_TEXTURES_URL } from '../constants'
import { PrecomputedTexturesLoader } from '../PrecomputedTexturesLoader'
import type { PrecomputedTextures } from '../types'

const loader = new PrecomputedTexturesLoader()

/**
 * @deprecated Use useLoader with PrecomputedTexturesLoader instead.
 * This will be removed in the future release.
 */
export function useAtmosphereTextureProps(
  url = DEFAULT_PRECOMPUTED_TEXTURES_URL
): { textures: PrecomputedTextures } {
  const renderer = useThree(({ gl }) => gl)
  const textures = useLoader(loader.setType(renderer), url)
  return { textures }
}
