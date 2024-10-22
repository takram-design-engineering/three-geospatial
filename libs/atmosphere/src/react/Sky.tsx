import { ScreenQuad } from '@react-three/drei'
import { useThree, type MeshProps } from '@react-three/fiber'
import { forwardRef, useEffect, useMemo } from 'react'
import { type BufferGeometry, type Mesh, type Vector3 } from 'three'

import { type AtmosphereMaterialProps } from '../AtmosphereMaterialBase'
import { SkyMaterial, skyMaterialParametersDefaults } from '../SkyMaterial'
import { separateProps } from './separateProps'
import { usePrecomputedTextures } from './usePrecomputedTextures'

export type SkyImpl = Mesh<BufferGeometry, SkyMaterial>

export interface SkyProps extends MeshProps, AtmosphereMaterialProps {
  sun?: boolean
  moon?: boolean
  moonDirection?: Vector3
  moonAngularRadius?: number
  lunarRadianceScale?: number
}

export const Sky = forwardRef<SkyImpl, SkyProps>(
  function Sky(props, forwardedRef) {
    const [
      atmosphereParameters,
      {
        sun,
        moon,
        moonDirection,
        moonAngularRadius,
        lunarRadianceScale,
        ...others
      }
    ] = separateProps({
      ...skyMaterialParametersDefaults,
      ...props
    })

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
          {...atmosphereParameters}
          useHalfFloat={useHalfFloat}
          sun={sun}
          moon={moon}
          moonDirection={moonDirection}
          moonAngularRadius={moonAngularRadius}
          lunarRadianceScale={lunarRadianceScale}
        />
      </ScreenQuad>
    )
  }
)
