import { extend, type ThreeElement } from '@react-three/fiber'
import { EffectComposerContext } from '@react-three/postprocessing'
import {
  useContext,
  useEffect,
  useRef,
  type ComponentPropsWithoutRef,
  type FC,
  type Ref
} from 'react'
import { mergeRefs } from 'react-merge-refs'

import { LightingMaskPass } from '../LightingMaskPass'
import { AtmosphereContext } from './Atmosphere'

declare module '@react-three/fiber' {
  interface ThreeElements {
    lightingMaskPass: ThreeElement<typeof LightingMaskPass>
  }
}

export interface LightingMaskProps
  extends Omit<ComponentPropsWithoutRef<'lightingMaskPass'>, 'args'> {
  ref?: Ref<LightingMaskPass>
}

export const LightingMask: FC<LightingMaskProps> = ({
  ref: forwardedRef,
  ...props
}) => {
  const { transientStates } = useContext(AtmosphereContext)
  const ref = useRef<LightingMaskPass>(null)

  useEffect(() => {
    if (ref.current == null) {
      return
    }
    if (transientStates != null) {
      transientStates.lightingMask = {
        map: ref.current.texture,
        channel: 'r'
      }
      return () => {
        transientStates.lightingMask = null
      }
    }
  }, [transientStates])

  const { scene, camera } = useContext(EffectComposerContext)
  extend({ LightingMaskPass })
  return (
    <lightingMaskPass
      ref={mergeRefs([ref, forwardedRef])}
      {...props}
      args={[scene, camera]}
    />
  )
}

/** @deprecated Use LightingMaskProps instead. */
export type IrradianceMaskProps = LightingMaskProps

/** @deprecated Use LightingMask instead. */
export const IrradianceMask = LightingMask
