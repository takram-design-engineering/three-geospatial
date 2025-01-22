import { ScreenQuad } from '@react-three/drei'
import { useFrame, type MeshProps } from '@react-three/fiber'
import { forwardRef, useContext, useEffect, useMemo } from 'react'
import { type BufferGeometry, type Color, type Mesh, type Vector3 } from 'three'

import { type ExtendedProps } from '@takram/three-geospatial/r3f'

import { type AtmosphereMaterialProps } from '../AtmosphereMaterialBase'
import { SKY_RENDER_ORDER } from '../constants'
import { SkyMaterial, skyMaterialParametersDefaults } from '../SkyMaterial'
import { AtmosphereContext } from './Atmosphere'
import { separateProps } from './separateProps'

export type SkyImpl = Mesh<BufferGeometry, SkyMaterial>

export type SkyProps = MeshProps &
  AtmosphereMaterialProps &
  ExtendedProps<{
    sun?: boolean
    moon?: boolean
    moonDirection?: Vector3
    moonAngularRadius?: number
    lunarRadianceScale?: number
    groundAlbedo?: Color
  }>

export const Sky = /*#__PURE__*/ forwardRef<SkyImpl, SkyProps>(
  function Sky(props, forwardedRef) {
    const { textures, transientStates, ...contextProps } =
      useContext(AtmosphereContext)

    const [
      atmosphereParameters,
      {
        sun,
        moon,
        moonDirection,
        moonAngularRadius,
        lunarRadianceScale,
        groundAlbedo,
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
      if (transientStates != null) {
        material.sunDirection.copy(transientStates.sunDirection)
        material.moonDirection.copy(transientStates.moonDirection)
        material.ellipsoidCenter.copy(transientStates.ellipsoidCenter)
        material.ellipsoidMatrix.copy(transientStates.ellipsoidMatrix)
      }
    })

    return (
      <ScreenQuad renderOrder={SKY_RENDER_ORDER} {...others} ref={forwardedRef}>
        <primitive
          object={material}
          {...atmosphereParameters}
          sun={sun}
          moon={moon}
          moonDirection={moonDirection}
          moonAngularRadius={moonAngularRadius}
          lunarRadianceScale={lunarRadianceScale}
          groundAlbedo={groundAlbedo}
        />
      </ScreenQuad>
    )
  }
)
