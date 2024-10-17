import { ScreenQuad } from '@react-three/drei'
import { useThree, type MeshProps } from '@react-three/fiber'
import { forwardRef, useMemo } from 'react'
import { type BufferGeometry, type Mesh, type Vector3 } from 'three'

import {
  atmosphereMaterialParametersDefaults,
  type AtmosphereMaterial
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
import { IrradianceMaterial } from './IrradianceMaterial'
import { usePrecomputedData } from './usePrecomputedData'

export type IrradianceImpl = Mesh<BufferGeometry, AtmosphereMaterial>

export interface IrradianceProps extends MeshProps {
  sunDirection?: Vector3
  sunAngularRadius?: number
}

export const Irradiance = forwardRef<IrradianceImpl, IrradianceProps>(
  function Irradiance(props, forwardedRef) {
    const { sunDirection, sunAngularRadius, ...others } = {
      ...atmosphereMaterialParametersDefaults,
      ...props
    }

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

    const material = useMemo(() => new IrradianceMaterial(), [])
    return (
      <ScreenQuad renderOrder={-1} {...others} ref={forwardedRef}>
        <primitive
          object={material}
          irradianceTexture={irradianceTexture}
          scatteringTexture={scatteringTexture}
          transmittanceTexture={transmittanceTexture}
          useHalfFloat={useHalfFloat}
          sunDirection={sunDirection}
          sunAngularRadius={sunAngularRadius}
        />
      </ScreenQuad>
    )
  }
)
