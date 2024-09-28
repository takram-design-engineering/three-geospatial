import { EffectComposerContext } from '@react-three/postprocessing'
import { type Effect } from 'postprocessing'
import { forwardRef, useContext, useMemo } from 'react'
import { type Vector3 } from 'three'

import { AerialPerspectiveEffect } from './AerialPerspectiveEffect'
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

export interface AerialPerspectiveProps {
  sunDirection?: Vector3
}

export const AerialPerspective = forwardRef<Effect, AerialPerspectiveProps>(
  ({ sunDirection }, forwardedRef) => {
    const { camera, normalPass } = useContext(EffectComposerContext)
    const effect = useMemo(() => new AerialPerspectiveEffect(camera), [camera])

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
      <primitive
        ref={forwardedRef}
        object={effect}
        normalBuffer={normalPass?.texture ?? null}
        irradianceTexture={irradianceTexture}
        scatteringTexture={scatteringTexture}
        transmittanceTexture={transmittanceTexture}
        sunDirection={sunDirection}
      />
    )
  }
)
