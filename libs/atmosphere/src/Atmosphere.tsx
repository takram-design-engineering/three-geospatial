import { ScreenQuad } from '@react-three/drei'
import { extend, type MaterialNode, type MeshProps } from '@react-three/fiber'
import { forwardRef } from 'react'
import { type Mesh, type Vector3 } from 'three'

import {
  AtmosphereMaterial,
  type AtmosphereMaterialParameters
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

declare module '@react-three/fiber' {
  export interface ThreeElements {
    atmosphereMaterial: MaterialNode<
      AtmosphereMaterial,
      [AtmosphereMaterialParameters]
    >
  }
}

extend({ AtmosphereMaterial })

export interface AtmosphereProps extends MeshProps {
  sunDirection?: Vector3
  sunAngularRadius?: number
  exposure?: number
}

export const Atmosphere = forwardRef<Mesh, AtmosphereProps>(
  (
    { sunDirection, sunAngularRadius, exposure, ...props } = {},
    forwardedRef
  ) => {
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

    return (
      <ScreenQuad {...props} ref={forwardedRef}>
        <atmosphereMaterial
          irradianceTexture={irradianceTexture}
          scatteringTexture={scatteringTexture}
          transmittanceTexture={transmittanceTexture}
          sunDirection={sunDirection}
          sunAngularRadius={sunAngularRadius}
          exposure={exposure}
        />
      </ScreenQuad>
    )
  }
)
