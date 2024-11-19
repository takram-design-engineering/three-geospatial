import { ScreenQuad } from '@react-three/drei'
import { useFrame, type MeshProps } from '@react-three/fiber'
import { forwardRef, useContext, useEffect, useMemo } from 'react'
import { type BufferGeometry, type Mesh, type Vector3 } from 'three'

import { type AtmosphereMaterialProps } from '../AtmosphereMaterialBase'
import { SkyMaterial, skyMaterialParametersDefaults } from '../SkyMaterial'
import { AtmosphereContext } from './Atmosphere'
import { separateProps } from './separateProps'

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
    const { textures, transientProps, ...contextProps } =
      useContext(AtmosphereContext)

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
      ...contextProps,
      ...textures,
      ...props
    })

    const material = useMemo(() => new SkyMaterial(), [])
    useEffect(() => {
      return () => {
        material.dispose()
      }
    }, [material])

    useFrame(() => {
      if (transientProps != null) {
        material.sunDirection.copy(transientProps.sunDirection)
        material.moonDirection.copy(transientProps.moonDirection)
      }
    })

    return (
      <ScreenQuad renderOrder={-1} {...others} ref={forwardedRef}>
        <primitive
          object={material}
          {...atmosphereParameters}
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
