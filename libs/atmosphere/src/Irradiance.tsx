import { ScreenQuad } from '@react-three/drei'
import { useThree, type MeshProps } from '@react-three/fiber'
import { forwardRef, useMemo } from 'react'
import { type BufferGeometry, type Mesh, type Vector3 } from 'three'

import { type Ellipsoid } from '@geovanni/core'

import {
  IrradianceMaterial,
  irradianceMaterialParametersDefaults
} from './IrradianceMaterial'
import { usePrecomputedTextures } from './usePrecomputedTextures'

export type IrradianceImpl = Mesh<BufferGeometry, IrradianceMaterial>

export interface IrradianceProps extends MeshProps {
  ellipsoid?: Ellipsoid
  photometric?: boolean
  sun?: boolean
  sunDirection?: Vector3
  sunAngularRadius?: number
}

export const Irradiance = forwardRef<IrradianceImpl, IrradianceProps>(
  function Irradiance(props, forwardedRef) {
    const {
      ellipsoid,
      photometric,
      sun,
      sunDirection,
      sunAngularRadius,
      ...others
    } = {
      ...irradianceMaterialParametersDefaults,
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
          ellipsoid={ellipsoid}
          photometric={photometric}
          sun={sun}
          sunDirection={sunDirection}
          sunAngularRadius={sunAngularRadius}
        />
      </ScreenQuad>
    )
  }
)
