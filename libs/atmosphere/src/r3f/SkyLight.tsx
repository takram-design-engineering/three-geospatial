import { extend, useFrame, type Object3DNode } from '@react-three/fiber'
import {
  forwardRef,
  useContext,
  useRef,
  type ComponentPropsWithRef
} from 'react'
import { mergeRefs } from 'react-merge-refs'

import { SkyLightProbe } from '../SkyLightProbe'
import { AtmosphereContext } from './Atmosphere'

declare module '@react-three/fiber' {
  interface ThreeElements {
    skyLightProbe: Object3DNode<SkyLightProbe, typeof SkyLightProbe>
  }
}

export interface SkyLightProps extends ComponentPropsWithRef<'skyLightProbe'> {}

export const SkyLight = /*#__PURE__*/ forwardRef<SkyLightProbe, SkyLightProps>(
  function SkyLight(props, forwardedRef) {
    const { textures, transientProps, ...contextProps } =
      useContext(AtmosphereContext)

    const ref = useRef<SkyLightProbe>(null)
    useFrame(() => {
      const probe = ref.current
      if (probe == null) {
        return
      }
      if (transientProps != null) {
        probe.sunDirection.copy(transientProps.sunDirection)
        probe.update()
      }
    })

    extend({ SkyLightProbe })
    return (
      <skyLightProbe
        ref={mergeRefs([ref, forwardedRef])}
        {...contextProps}
        {...textures}
        {...props}
      />
    )
  }
)
