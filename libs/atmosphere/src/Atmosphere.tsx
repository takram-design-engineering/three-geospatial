import { ScreenQuad } from '@react-three/drei'
import { type MeshProps } from '@react-three/fiber'
import { forwardRef, useMemo } from 'react'
import { type BufferGeometry, type Mesh, type Vector3 } from 'three'

import { AtmosphereMaterial } from './AtmosphereMaterial'
import {
  IRRADIANCE_TEXTURE_HEIGHT,
  IRRADIANCE_TEXTURE_WIDTH,
  SCATTERING_TEXTURE_DEPTH,
  SCATTERING_TEXTURE_HEIGHT,
  SCATTERING_TEXTURE_WIDTH,
  TRANSMITTANCE_TEXTURE_HEIGHT,
  TRANSMITTANCE_TEXTURE_WIDTH
} from './constants'
import { usePrecomputedData } from './usePrecomputedData'

export type AtmosphereImpl = Mesh<BufferGeometry, AtmosphereMaterial>

export interface AtmosphereProps extends MeshProps {
  sunDirection?: Vector3
  sunAngularRadius?: number
}

export const Atmosphere = forwardRef<AtmosphereImpl, AtmosphereProps>(
  function Atmosphere(
    { sunDirection, sunAngularRadius, ...props } = {},
    forwardedRef
  ) {
    // Make textures shared.
    const irradianceTexture = usePrecomputedData('/irradiance.bin', {
      width: IRRADIANCE_TEXTURE_WIDTH,
      height: IRRADIANCE_TEXTURE_HEIGHT
    })
    const scatteringTexture = usePrecomputedData('/scattering.bin', {
      width: SCATTERING_TEXTURE_WIDTH,
      height: SCATTERING_TEXTURE_HEIGHT,
      depth: SCATTERING_TEXTURE_DEPTH
    })
    const transmittanceTexture = usePrecomputedData('/transmittance.bin', {
      width: TRANSMITTANCE_TEXTURE_WIDTH,
      height: TRANSMITTANCE_TEXTURE_HEIGHT
    })

    const material = useMemo(() => new AtmosphereMaterial(), [])
    return (
      <ScreenQuad {...props} ref={forwardedRef}>
        <primitive
          object={material}
          irradianceTexture={irradianceTexture}
          scatteringTexture={scatteringTexture}
          transmittanceTexture={transmittanceTexture}
          sunDirection={sunDirection}
          sunAngularRadius={sunAngularRadius}
        />
      </ScreenQuad>
    )
  }
)
