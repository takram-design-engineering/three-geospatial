import {
  applyProps,
  type DirectionalLightProps as DirectionalLightImplProps
} from '@react-three/fiber'
import { forwardRef, memo, useImperativeHandle } from 'react'
import { type Vector3Like, type Vector3Tuple } from 'three'

import { type Callable } from '@takram/three-geospatial'

import { type CascadedDirectionalLights as CascadedDirectionalLightsImpl } from '../CascadedDirectionalLights'
import { useCSM } from './useCSM'

export interface CascadedDirectionalLightsProps
  extends Partial<{
    [K in keyof DirectionalLightImplProps as Exclude<
      DirectionalLightImplProps[K],
      null | undefined
    > extends Callable
      ? never
      : K]: DirectionalLightImplProps[K]
  }> {
  direction?: Vector3Like | Vector3Tuple
}

export const CascadedDirectionalLights = memo(
  forwardRef<CascadedDirectionalLightsImpl, CascadedDirectionalLightsProps>(
    function CascadedDirectionalLights({ direction, ...props }, forwardedRef) {
      const { directionalLights } = useCSM()
      if (direction != null) {
        directionalLights.direction.set(
          ...(Array.isArray(direction)
            ? direction
            : ([direction.x, direction.y, direction.z] as const))
        )
      }
      applyProps(directionalLights.mainLight, props)
      useImperativeHandle(forwardedRef, () => directionalLights, [
        directionalLights
      ])
      return null
    }
  )
)
