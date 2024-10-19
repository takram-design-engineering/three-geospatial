import { useLoader } from '@react-three/fiber'
import { type Data3DTexture, type DataTexture } from 'three'
import join from 'url-join'

import { Float32Data2DLoader, Float32Data3DLoader } from '@geovanni/core'

import {
  IRRADIANCE_TEXTURE_HEIGHT,
  IRRADIANCE_TEXTURE_WIDTH,
  SCATTERING_TEXTURE_DEPTH,
  SCATTERING_TEXTURE_HEIGHT,
  SCATTERING_TEXTURE_WIDTH,
  TRANSMITTANCE_TEXTURE_HEIGHT,
  TRANSMITTANCE_TEXTURE_WIDTH
} from '../constants'

export interface PrecomputedTexturesParams {
  useHalfFloat?: boolean
}

export interface PrecomputedTextures {
  irradianceTexture: DataTexture
  scatteringTexture: Data3DTexture
  transmittanceTexture: DataTexture
}

export function usePrecomputedTextures(
  url: string,
  useHalfFloat: boolean
): PrecomputedTextures {
  const irradianceTexture = useLoader(
    Float32Data2DLoader,
    join(url, `irradiance${useHalfFloat ? '.bin' : '_float.bin'}`)
  )
  const scatteringTexture = useLoader(
    Float32Data3DLoader,
    join(url, `scattering${useHalfFloat ? '.bin' : '_float.bin'}`)
  )
  const transmittanceTexture = useLoader(
    Float32Data2DLoader,
    join(url, `transmittance${useHalfFloat ? '.bin' : '_float.bin'}`)
  )

  // Note that the below will be executed multiple times, but it's harmless.
  irradianceTexture.image.width = IRRADIANCE_TEXTURE_WIDTH
  irradianceTexture.image.height = IRRADIANCE_TEXTURE_HEIGHT
  scatteringTexture.image.width = SCATTERING_TEXTURE_WIDTH
  scatteringTexture.image.height = SCATTERING_TEXTURE_HEIGHT
  scatteringTexture.image.depth = SCATTERING_TEXTURE_DEPTH
  transmittanceTexture.image.width = TRANSMITTANCE_TEXTURE_WIDTH
  transmittanceTexture.image.height = TRANSMITTANCE_TEXTURE_HEIGHT
  if (useHalfFloat) {
    irradianceTexture.internalFormat = 'RGBA16F'
    scatteringTexture.internalFormat = 'RGBA16F'
    transmittanceTexture.internalFormat = 'RGBA16F'
  }

  return {
    irradianceTexture,
    scatteringTexture,
    transmittanceTexture
  }
}
