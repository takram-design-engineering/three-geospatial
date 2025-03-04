import { extend, useFrame, type ThreeElement } from '@react-three/fiber'
import {
  forwardRef,
  useContext,
  useMemo,
  useRef,
  type ComponentPropsWithRef
} from 'react'
import { mergeRefs } from 'react-merge-refs'
import { Object3D } from 'three'

import {
  SunDirectionalLight,
  sunDirectionalLightParametersDefaults
} from '../SunDirectionalLight'
import { AtmosphereContext } from './Atmosphere'

declare module '@react-three/fiber' {
  interface ThreeElements {
    sunDirectionalLight: ThreeElement<typeof SunDirectionalLight>
  }
}

export interface SunLightProps
  extends Omit<ComponentPropsWithRef<'sunDirectionalLight'>, 'target'> {}

export const SunLight = /*#__PURE__*/ forwardRef<
  SunDirectionalLight,
  SunLightProps
>(function SunLight({ position, ...props }, forwardedRef) {
  const { textures, transientStates, ...contextProps } =
    useContext(AtmosphereContext)

  const ref = useRef<SunDirectionalLight>(null)
  useFrame(() => {
    const light = ref.current
    if (light == null) {
      return
    }
    if (transientStates != null) {
      light.sunDirection.copy(transientStates.sunDirection)
      light.ellipsoidCenter.copy(transientStates.ellipsoidCenter)
      light.ellipsoidMatrix.copy(transientStates.ellipsoidMatrix)
      light.update()
    }
  })

  const target = useMemo(() => new Object3D(), [])
  extend({ SunDirectionalLight })
  return (
    <>
      <sunDirectionalLight
        ref={mergeRefs([ref, forwardedRef])}
        {...sunDirectionalLightParametersDefaults}
        {...contextProps}
        {...textures}
        {...props}
        target={target}
      />
      <primitive object={target} position={position} />
    </>
  )
})
