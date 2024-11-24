import { extend, useFrame, type Object3DNode } from '@react-three/fiber'
import {
  forwardRef,
  useContext,
  useMemo,
  useRef,
  type ComponentPropsWithRef
} from 'react'
import { mergeRefs } from 'react-merge-refs'
import { Object3D } from 'three'

import { DirectionalSunLight } from '../DirectionalSunLight'
import { AtmosphereContext } from './Atmosphere'

declare module '@react-three/fiber' {
  interface ThreeElements {
    directionalSunLight: Object3DNode<
      DirectionalSunLight,
      typeof DirectionalSunLight
    >
  }
}

export interface SunLightProps
  extends Omit<ComponentPropsWithRef<'directionalSunLight'>, 'target'> {}

export const SunLight = forwardRef<DirectionalSunLight, SunLightProps>(
  function SunLight({ position, ...props }, forwardedRef) {
    const { textures, transientProps, ...contextProps } =
      useContext(AtmosphereContext)

    const ref = useRef<DirectionalSunLight>(null)
    useFrame(() => {
      const light = ref.current
      if (light == null) {
        return
      }
      if (transientProps != null) {
        light.direction.copy(transientProps.sunDirection)
        light.update()
      }
    })

    const target = useMemo(() => new Object3D(), [])
    extend({ DirectionalSunLight })
    return (
      <>
        <directionalSunLight
          ref={mergeRefs([ref, forwardedRef])}
          {...contextProps}
          {...textures}
          {...props}
          target={target}
        />
        <primitive object={target} position={position} />
      </>
    )
  }
)
