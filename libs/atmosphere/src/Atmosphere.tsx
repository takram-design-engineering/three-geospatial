import { ScreenQuad } from '@react-three/drei'
import { useThree, type MeshProps } from '@react-three/fiber'
import { forwardRef, useMemo } from 'react'
import { type BufferGeometry, type Mesh, type Vector3 } from 'three'

import {
  AtmosphereMaterial,
  atmosphereMaterialParametersDefaults
} from './AtmosphereMaterial'
import { usePrecomputedTextures } from './usePrecomputedTextures'

export type AtmosphereImpl = Mesh<BufferGeometry, AtmosphereMaterial>

export interface AtmosphereProps extends MeshProps {
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
    return (
      <ScreenQuad renderOrder={-1} {...others} ref={forwardedRef}>
        <primitive
          object={material}
          {...precomputedTextures}
          useHalfFloat={useHalfFloat}
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
