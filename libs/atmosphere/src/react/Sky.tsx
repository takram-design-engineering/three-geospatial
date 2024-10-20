import { ScreenQuad } from '@react-three/drei'
import { useThree, type MeshProps } from '@react-three/fiber'
import { forwardRef, useEffect, useMemo } from 'react'
import { type BufferGeometry, type Mesh, type Vector3 } from 'three'

import { type Ellipsoid } from '@geovanni/core'

import { SkyMaterial, skyMaterialParametersDefaults } from '../SkyMaterial'
import { usePrecomputedTextures } from './usePrecomputedTextures'

export type SkyImpl = Mesh<BufferGeometry, SkyMaterial>

export interface SkyProps extends MeshProps {
  ellipsoid?: Ellipsoid
  osculateEllipsoid?: boolean
  photometric?: boolean
  sun?: boolean
  sunDirection?: Vector3
  sunAngularRadius?: number
  moon?: boolean
  moonDirection?: Vector3
  moonAngularRadius?: number
  lunarRadianceScale?: number
}

export const Sky = forwardRef<SkyImpl, SkyProps>(
  function Sky(props, forwardedRef) {
    const {
      ellipsoid,
      osculateEllipsoid,
      photometric,
      sun,
      sunDirection,
      sunAngularRadius,
      moon,
      moonDirection,
      moonAngularRadius,
      lunarRadianceScale,
      ...others
    } = { ...skyMaterialParametersDefaults, ...props }

    // TODO: Make the texture paths configurable.
    const gl = useThree(({ gl }) => gl)
    const useHalfFloat = useMemo(
      () => gl.getContext().getExtension('OES_texture_float_linear') == null,
      [gl]
    )
    const precomputedTextures = usePrecomputedTextures('/', useHalfFloat)

    const material = useMemo(() => new SkyMaterial(), [])
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
          osculateEllipsoid={osculateEllipsoid}
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
