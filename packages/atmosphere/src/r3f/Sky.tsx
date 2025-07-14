import { ScreenQuad } from '@react-three/drei'
import { useFrame, type ElementProps } from '@react-three/fiber'
import { useContext, useEffect, useMemo, type FC } from 'react'
import type { BufferGeometry, Color, Mesh, Vector3 } from 'three'

import type { AtmosphereMaterialProps } from '../AtmosphereMaterialBase'
import { SKY_RENDER_ORDER } from '../constants'
import { SkyMaterial, skyMaterialParametersDefaults } from '../SkyMaterial'
import { AtmosphereContext } from './Atmosphere'
import { separateProps } from './separateProps'

export type SkyImpl = Mesh<BufferGeometry, SkyMaterial>

export interface SkyProps
  extends ElementProps<
    typeof Mesh,
    Mesh &
      Required<AtmosphereMaterialProps> & {
        sun: boolean
        moon: boolean
        moonDirection: Vector3
        moonAngularRadius: number
        lunarRadianceScale: number
        groundAlbedo: Color
      }
  > {}

export const Sky: FC<SkyProps> = ({ ref: forwardedRef, ...props }) => {
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
      ...meshProps
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
      material.worldToECEFMatrix.copy(transientStates.worldToECEFMatrix)

      // TODO: Since cloud shadows are computed in post-processing, the shadow
      // length texture is delayed by 1 frame.
      material.shadowLength = transientStates.shadowLength
    }
  })

  return (
    <ScreenQuad
      renderOrder={SKY_RENDER_ORDER}
      {...meshProps}
      ref={forwardedRef}
    >
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
