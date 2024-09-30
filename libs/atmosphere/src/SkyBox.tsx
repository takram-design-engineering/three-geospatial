import { Box } from '@react-three/drei'
import { forwardRef, useMemo, type ComponentPropsWithRef } from 'react'
import { type BoxGeometry, type Mesh, type Vector3 } from 'three'

import {
  IRRADIANCE_TEXTURE_HEIGHT,
  IRRADIANCE_TEXTURE_WIDTH,
  SCATTERING_TEXTURE_DEPTH,
  SCATTERING_TEXTURE_HEIGHT,
  SCATTERING_TEXTURE_WIDTH,
  TRANSMITTANCE_TEXTURE_HEIGHT,
  TRANSMITTANCE_TEXTURE_WIDTH
} from './constants'
import { SkyBoxMaterial } from './SkyBoxMaterial'
import { usePrecomputedData } from './usePrecomputedData'

export type SkyBoxImpl = Mesh<BoxGeometry, SkyBoxMaterial>

export interface SkyBoxProps extends ComponentPropsWithRef<typeof Box> {
  sunDirection?: Vector3
  sunAngularRadius?: number
}

export const SkyBox = forwardRef<SkyBoxImpl, SkyBoxProps>(function SkyBox(
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

  const material = useMemo(() => new SkyBoxMaterial(), [])
  return (
    <Box args={[1, 1, 1]} {...props} ref={forwardedRef}>
      <primitive
        object={material}
        irradianceTexture={irradianceTexture}
        scatteringTexture={scatteringTexture}
        transmittanceTexture={transmittanceTexture}
        sunDirection={sunDirection}
        sunAngularRadius={sunAngularRadius}
      />
    </Box>
  )
})
