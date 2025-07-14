import { extend, useFrame, type ThreeElement } from '@react-three/fiber'
import {
  useContext,
  useRef,
  type ComponentPropsWithoutRef,
  type FC,
  type Ref
} from 'react'
import { mergeRefs } from 'react-merge-refs'

import {
  SkyLightProbe,
  skyLightProbeParametersDefaults
} from '../SkyLightProbe'
import { AtmosphereContext } from './Atmosphere'

declare module '@react-three/fiber' {
  interface ThreeElements {
    skyLightProbe: ThreeElement<typeof SkyLightProbe>
  }
}

export interface SkyLightProps
  extends ComponentPropsWithoutRef<'skyLightProbe'> {
  ref?: Ref<SkyLightProbe>
}

export const SkyLight: FC<SkyLightProps> = ({
  ref: forwardedRef,
  ...props
}) => {
  const { textures, transientStates, ...contextProps } =
    useContext(AtmosphereContext)

  const ref = useRef<SkyLightProbe>(null)
  useFrame(() => {
    const probe = ref.current
    if (probe == null) {
      return
    }
    if (transientStates != null) {
      probe.sunDirection.copy(transientStates.sunDirection)
      probe.worldToECEFMatrix.copy(transientStates.worldToECEFMatrix)
      probe.update()
    }
  })

  extend({ SkyLightProbe })
  return (
    <skyLightProbe
      ref={mergeRefs([ref, forwardedRef])}
      {...skyLightProbeParametersDefaults}
      {...contextProps}
      {...textures}
      {...props}
    />
  )
}
