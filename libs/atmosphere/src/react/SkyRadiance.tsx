import { ScreenQuad } from '@react-three/drei'
import { useThree, type MeshProps } from '@react-three/fiber'
import { forwardRef, useMemo } from 'react'
import { type BufferGeometry, type Mesh, type Vector3 } from 'three'

import { type Ellipsoid } from '@geovanni/core'

import {
  SkyRadianceMaterial,
  skyRadianceMaterialParametersDefaults
} from '../SkyRadianceMaterial'
import { usePrecomputedTextures } from './usePrecomputedTextures'

export type SkyRadianceImpl = Mesh<BufferGeometry, SkyRadianceMaterial>

export interface SkyRadianceProps extends MeshProps {
  ellipsoid?: Ellipsoid
  photometric?: boolean
  sunDirection?: Vector3
  sunAngularRadius?: number
}

export const SkyRadiance = forwardRef<SkyRadianceImpl, SkyRadianceProps>(
  function SkyRadiance(props, forwardedRef) {
    const {
      ellipsoid,
      photometric,
      sunDirection,
      sunAngularRadius,
      ...others
    } = {
      ...skyRadianceMaterialParametersDefaults,
      ...props
    }

    // TODO: Make the texture paths configurable.
    const gl = useThree(({ gl }) => gl)
    const useHalfFloat = useMemo(
      () => gl.getContext().getExtension('OES_texture_float_linear') == null,
      [gl]
    )
    const precomputedTextures = usePrecomputedTextures('/', useHalfFloat)

    const material = useMemo(() => new SkyRadianceMaterial(), [])
    return (
      <ScreenQuad renderOrder={-1} {...others} ref={forwardedRef}>
        <primitive
          object={material}
          {...precomputedTextures}
          useHalfFloat={useHalfFloat}
          ellipsoid={ellipsoid}
          photometric={photometric}
          sunDirection={sunDirection}
          sunAngularRadius={sunAngularRadius}
        />
      </ScreenQuad>
    )
  }
)
