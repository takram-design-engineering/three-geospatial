import { useLoader, useThree } from '@react-three/fiber'

import {
  PrecomputedTexturesLoader,
  type PrecomputedTextures
} from '../PrecomputedTexturesLoader'

export function useAtmosphereTextureProps(
  url = 'https://media.githubusercontent.com/media/takram-design-engineering/three-geospatial/9627216cc50057994c98a2118f3c4a23765d43b9/packages/atmosphere/assets',
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
