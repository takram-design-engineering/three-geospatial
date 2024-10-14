import { useThree, type PointsProps } from '@react-three/fiber'
import axios from 'axios'
import { forwardRef, useEffect, useMemo } from 'react'
import { suspend } from 'suspend-react'
import { type Points, type Vector3 } from 'three'

import { type Ellipsoid } from '@geovanni/core'

import {
  IRRADIANCE_TEXTURE_HEIGHT,
  IRRADIANCE_TEXTURE_WIDTH,
  SCATTERING_TEXTURE_DEPTH,
  SCATTERING_TEXTURE_HEIGHT,
  SCATTERING_TEXTURE_WIDTH,
  TRANSMITTANCE_TEXTURE_HEIGHT,
  TRANSMITTANCE_TEXTURE_WIDTH
} from './constants'
import { StarsGeometry } from './StarsGeometry'
import { StarsMaterial, starsMaterialParametersDefaults } from './StarsMaterial'
import { usePrecomputedData } from './usePrecomputedData'

export type StarsImpl = Points<StarsGeometry, StarsMaterial>

export interface StarsProps extends PointsProps {
  ellipsoid?: Ellipsoid
  sunDirection?: Vector3
  pointSize?: number
  radianceScale?: number
  background?: boolean
}

export const Stars = forwardRef<StarsImpl, StarsProps>(
  function Stars(props, forwardedRef) {
    const { ellipsoid, pointSize, radianceScale, background, ...others } = {
      ...starsMaterialParametersDefaults,
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

    // TODO: Replace with a more advanced cache.
    const data = suspend(async () => {
      const response = await axios<ArrayBuffer>('/stars.bin', {
        responseType: 'arraybuffer'
      })
      return response.data
    }, [Stars])

    const geometry = useMemo(() => new StarsGeometry(data), [data])
    useEffect(() => {
      return () => {
        geometry.dispose()
      }
    }, [geometry])

    const material = useMemo(() => new StarsMaterial(), [])
    return (
      <points ref={forwardedRef} {...others} frustumCulled={false}>
        <primitive object={geometry} />
        <primitive
          object={material}
          irradianceTexture={irradianceTexture}
          scatteringTexture={scatteringTexture}
          transmittanceTexture={transmittanceTexture}
          useHalfFloat={useHalfFloat}
          pointSize={pointSize}
          radianceScale={radianceScale}
          background={background}
          depthTest={true}
          depthWrite={false}
        />
      </points>
    )
  }
)
