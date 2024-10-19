import { ScreenQuad } from '@react-three/drei'
import { useThree, type MeshProps } from '@react-three/fiber'
import { forwardRef, useEffect, useMemo } from 'react'
import { type BufferGeometry, type Mesh, type Vector3 } from 'three'

import { type Ellipsoid } from '@geovanni/core'

import {
  AtmosphereMaterial,
  atmosphereMaterialParametersDefaults
} from '../AtmosphereMaterial'
import { usePrecomputedTextures } from './usePrecomputedTextures'

export type AtmosphereImpl = Mesh<BufferGeometry, AtmosphereMaterial>

export interface AtmosphereProps extends MeshProps {
  ellipsoid?: Ellipsoid
  photometric?: boolean
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
      ellipsoid,
      photometric,
      sun,
      sunDirection,
      sunAngularRadius,
      moon,
      moonDirection,
      moonAngularRadius,
      lunarRadianceScale,
      ...others
    } = { ...atmosphereMaterialParametersDefaults, ...props }

    // TODO: Make the texture paths configurable.
    const gl = useThree(({ gl }) => gl)
    const useHalfFloat = useMemo(
      () => gl.getContext().getExtension('OES_texture_float_linear') == null,
      [gl]
    )
    const precomputedTextures = usePrecomputedTextures('/', useHalfFloat)

    const material = useMemo(() => new AtmosphereMaterial(), [])
    useEffect(() => {
      return () => {
        material.dispose()
      }
    }, [material])

    return (
      <ScreenQuad renderOrder={-1} {...others} ref={forwardedRef}>
        <primitive
          object={material}
          {...precomputedTextures}
          useHalfFloat={useHalfFloat}
          ellipsoid={ellipsoid}
          photometric={photometric}
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
