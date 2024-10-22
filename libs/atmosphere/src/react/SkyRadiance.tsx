import { ScreenQuad } from '@react-three/drei'
import { useThree, type MeshProps } from '@react-three/fiber'
import { forwardRef, useMemo } from 'react'
import { type BufferGeometry, type Mesh } from 'three'

import { type AtmosphereMaterialProps } from '../AtmosphereMaterialBase'
import {
  SkyRadianceMaterial,
  skyRadianceMaterialParametersDefaults
} from '../SkyRadianceMaterial'
import { separateProps } from './separateProps'
import { usePrecomputedTextures } from './usePrecomputedTextures'

export type SkyRadianceImpl = Mesh<BufferGeometry, SkyRadianceMaterial>

export interface SkyRadianceProps extends MeshProps, AtmosphereMaterialProps {}

export const SkyRadiance = forwardRef<SkyRadianceImpl, SkyRadianceProps>(
  function SkyRadiance(props, forwardedRef) {
    const [atmosphereParameters, others] = separateProps({
      ...skyRadianceMaterialParametersDefaults,
      ...props
    })

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
          {...atmosphereParameters}
          useHalfFloat={useHalfFloat}
        />
      </ScreenQuad>
    )
  }
)
