import { useLoader, useThree, type PointsProps } from '@react-three/fiber'
import { forwardRef, useEffect, useMemo } from 'react'
import { type Points, type Vector3 } from 'three'

import { ArrayBufferLoader, type Ellipsoid } from '@geovanni/core'

import { StarsGeometry } from './StarsGeometry'
import { StarsMaterial, starsMaterialParametersDefaults } from './StarsMaterial'
import { usePrecomputedTextures } from './usePrecomputedTextures'

export type StarsImpl = Points<StarsGeometry, StarsMaterial>

export interface StarsProps extends PointsProps {
  ellipsoid?: Ellipsoid
  sunDirection?: Vector3
  pointSize?: number
  radianceScale?: number
  background?: boolean
}

export const Stars = forwardRef<StarsImpl, StarsProps>(
  function Stars(props, forwardedRef) {
    const { ellipsoid, pointSize, radianceScale, background, ...others } = {
      ...starsMaterialParametersDefaults,
      ...props
    }

    // TODO: Make the texture paths configurable.
    const gl = useThree(({ gl }) => gl)
    const useHalfFloat = useMemo(
      () => gl.getContext().getExtension('OES_texture_float_linear') == null,
      [gl]
    )
    const precomputedTextures = usePrecomputedTextures('/', useHalfFloat)

    // TODO: Make the data path configurable.
    const data = useLoader(ArrayBufferLoader, '/stars.bin')
    const geometry = useMemo(() => new StarsGeometry(data), [data])
    useEffect(() => {
      return () => {
        geometry.dispose()
      }
    }, [geometry])

    const material = useMemo(() => new StarsMaterial(), [])
    useEffect(() => {
      return () => {
        material.dispose()
      }
    }, [material])

    return (
      <points ref={forwardedRef} {...others} frustumCulled={false}>
        <primitive object={geometry} />
        <primitive
          object={material}
          {...precomputedTextures}
          useHalfFloat={useHalfFloat}
          pointSize={pointSize}
          radianceScale={radianceScale}
          background={background}
          depthTest={true}
          depthWrite={false}
        />
      </points>
    )
  }
)
