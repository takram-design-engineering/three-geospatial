import { extend, useFrame, type ThreeElement } from '@react-three/fiber'
import {
  useContext,
  useMemo,
  useRef,
  type ComponentPropsWithoutRef,
  type FC,
  type Ref
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
  extends Omit<ComponentPropsWithoutRef<'sunDirectionalLight'>, 'target'> {
  ref?: Ref<SunDirectionalLight>
}

export const SunLight: FC<SunLightProps> = ({
  ref: forwardedRef,
  position,
  ...props
}) => {
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
      light.worldToECEFMatrix.copy(transientStates.worldToECEFMatrix)
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
}
