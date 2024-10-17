import { ScreenQuad } from '@react-three/drei'
import { useThree, type MeshProps } from '@react-three/fiber'
import { forwardRef, useMemo } from 'react'
import { type BufferGeometry, type Mesh, type Vector3 } from 'three'

import {
  atmosphereMaterialParametersDefaults,
  type AtmosphereMaterial
} from './AtmosphereMaterial'
import { IrradianceMaterial } from './IrradianceMaterial'
import { usePrecomputedTextures } from './usePrecomputedTextures'

export type IrradianceImpl = Mesh<BufferGeometry, AtmosphereMaterial>

export interface IrradianceProps extends MeshProps {
  sunDirection?: Vector3
  sunAngularRadius?: number
}

export const Irradiance = forwardRef<IrradianceImpl, IrradianceProps>(
  function Irradiance(props, forwardedRef) {
    const { sunDirection, sunAngularRadius, ...others } = {
      ...atmosphereMaterialParametersDefaults,
      ...props
    }

    // TODO: Make the texture paths configurable.
    const gl = useThree(({ gl }) => gl)
    const useHalfFloat = useMemo(
      () => gl.getContext().getExtension('OES_texture_float_linear') == null,
      [gl]
    )
    const precomputedTextures = usePrecomputedTextures('/', useHalfFloat)

    const material = useMemo(() => new IrradianceMaterial(), [])
    return (
      <ScreenQuad renderOrder={-1} {...others} ref={forwardedRef}>
        <primitive
          object={material}
          {...precomputedTextures}
          useHalfFloat={useHalfFloat}
          sunDirection={sunDirection}
          sunAngularRadius={sunAngularRadius}
        />
      </ScreenQuad>
    )
  }
)
