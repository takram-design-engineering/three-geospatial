import {
  applyProps,
  type DirectionalLightProps as DirectionalLightImplProps
} from '@react-three/fiber'
import { forwardRef, memo, useImperativeHandle } from 'react'
import { type Vector3Like, type Vector3Tuple } from 'three'

import { type CascadedDirectionalLight as CascadedDirectionalLightImpl } from '../CascadedDirectionalLight'
import { useCSM } from './useCSM'

export interface CascadedDirectionalLightProps
  extends Partial<{
    [K in keyof DirectionalLightImplProps as Exclude<
      DirectionalLightImplProps[K],
      null | undefined
    > extends Function
      ? never
      : K]: DirectionalLightImplProps[K]
  }> {
  direction?: Vector3Like | Vector3Tuple
}

export const CascadedDirectionalLight = memo(
  forwardRef<CascadedDirectionalLightImpl, CascadedDirectionalLightProps>(
    function CascadedDirectionalLight({ direction, ...props }, forwardedRef) {
      const { directionalLight } = useCSM()
      if (direction != null) {
        directionalLight.direction.set(
          ...(Array.isArray(direction)
            ? direction
            : ([direction.x, direction.y, direction.z] as const))
        )
      }
      applyProps(directionalLight.mainLight, props)
      useImperativeHandle(forwardedRef, () => directionalLight, [
        directionalLight
      ])
      return null
    }
  )
)
