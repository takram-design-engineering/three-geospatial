import { ScreenQuad } from '@react-three/drei'
import { useThree, type MeshProps } from '@react-three/fiber'
import { forwardRef, useMemo } from 'react'
import { type BufferGeometry, type Mesh, type Vector3 } from 'three'

import {
  AtmosphereMaterial,
  atmosphereMaterialParametersDefaults
} from './AtmosphereMaterial'
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
  sun?: boolean
  sunDirection?: Vector3
  sunAngularRadius?: number
  moon?: boolean
  moonDirection?: Vector3
  moonAngularRadius?: number
  lunarRadianceScale?: number
}

export const Atmosphere = forwardRef<AtmosphereImpl, AtmosphereProps>(
  function Atmosphere(props, forwardedRef) {
    const {
      sun,
      sunDirection,
      sunAngularRadius,
      moon,
      moonDirection,
      moonAngularRadius,
      lunarRadianceScale,
      ...others
    } = { ...atmosphereMaterialParametersDefaults, ...props }

    // TODO: Make textures shared.
    const gl = useThree(({ gl }) => gl)
    const useHalfFloat = useMemo(
      () => gl.getContext().getExtension('OES_texture_float_linear') == null,
      [gl]
    )
    const irradianceTexture = usePrecomputedData('/irradiance.bin', {
      width: IRRADIANCE_TEXTURE_WIDTH,
      height: IRRADIANCE_TEXTURE_HEIGHT,
      useHalfFloat
    })
    const scatteringTexture = usePrecomputedData('/scattering.bin', {
      width: SCATTERING_TEXTURE_WIDTH,
      height: SCATTERING_TEXTURE_HEIGHT,
      depth: SCATTERING_TEXTURE_DEPTH,
      useHalfFloat
    })
    const transmittanceTexture = usePrecomputedData('/transmittance.bin', {
      width: TRANSMITTANCE_TEXTURE_WIDTH,
      height: TRANSMITTANCE_TEXTURE_HEIGHT,
      useHalfFloat
    })

    const material = useMemo(() => new AtmosphereMaterial(), [])
    return (
      <ScreenQuad renderOrder={-1} {...others} ref={forwardedRef}>
        <primitive
          object={material}
          irradianceTexture={irradianceTexture}
          scatteringTexture={scatteringTexture}
          transmittanceTexture={transmittanceTexture}
          useHalfFloat={useHalfFloat}
          sun={sun}
          sunDirection={sunDirection}
          sunAngularRadius={sunAngularRadius}
          moon={moon}
          moonDirection={moonDirection}
          moonAngularRadius={moonAngularRadius}
          lunarRadianceScale={lunarRadianceScale}
        />
      </ScreenQuad>
    )
  }
)
