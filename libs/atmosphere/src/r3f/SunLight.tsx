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

import { SunDirectionalLight } from '../SunDirectionalLight'
import { AtmosphereContext } from './Atmosphere'

declare module '@react-three/fiber' {
  interface ThreeElements {
    sunDirectionalLight: Object3DNode<
      SunDirectionalLight,
      typeof SunDirectionalLight
    >
  }
}

export interface SunLightProps
  extends Omit<ComponentPropsWithRef<'sunDirectionalLight'>, 'target'> {}

export const SunLight = /*#__PURE__*/ forwardRef<
  SunDirectionalLight,
  SunLightProps
>(function SunLight({ position, ...props }, forwardedRef) {
  const { textures, transientProps, ...contextProps } =
    useContext(AtmosphereContext)

  const ref = useRef<SunDirectionalLight>(null)
  useFrame(() => {
    const light = ref.current
    if (light == null) {
      return
    }
    if (transientProps != null) {
      light.sunDirection.copy(transientProps.sunDirection)
      light.update()
    }
  })

  const target = useMemo(() => new Object3D(), [])
  extend({ SunDirectionalLight })
  return (
    <>
      <sunDirectionalLight
        ref={mergeRefs([ref, forwardedRef])}
        {...contextProps}
        {...textures}
        {...props}
        target={target}
      />
      <primitive object={target} position={position} />
    </>
  )
})
