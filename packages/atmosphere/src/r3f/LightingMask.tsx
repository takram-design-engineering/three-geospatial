import { extend, type ThreeElement } from '@react-three/fiber'
import { EffectComposerContext } from '@react-three/postprocessing'
import {
  useCallback,
  useContext,
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

  const getRef = useCallback(
    (pass: LightingMaskPass | null) => {
      if (pass != null) {
        if (transientStates != null) {
          transientStates.lightingMask = {
            map: pass.texture,
            channel: 'r'
          }
          return () => {
            transientStates.lightingMask = null
          }
        }
      }
    },
    [transientStates]
  )

  const { scene, camera } = useContext(EffectComposerContext)
  extend({ LightingMaskPass })
  return (
    <lightingMaskPass
      ref={mergeRefs([getRef, forwardedRef])}
      {...props}
      args={[scene, camera]}
    />
  )
}

/** @deprecated Use LightingMaskProps instead. */
export type IrradianceMaskProps = LightingMaskProps

/** @deprecated Use LightingMask instead. */
export const IrradianceMask = LightingMask
