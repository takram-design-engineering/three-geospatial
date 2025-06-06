import { extend, type ThreeElement } from '@react-three/fiber'
import { EffectComposerContext } from '@react-three/postprocessing'
import {
  forwardRef,
  useContext,
  useLayoutEffect,
  useRef,
  type ComponentPropsWithRef
} from 'react'
import { mergeRefs } from 'react-merge-refs'

import { IrradianceMaskPass } from '../IrradianceMaskPass'
import { AtmosphereContext } from './Atmosphere'

declare module '@react-three/fiber' {
  interface ThreeElements {
    irradianceMaskPass: ThreeElement<typeof IrradianceMaskPass>
  }
}

export interface IrradianceMaskProps
  extends Omit<ComponentPropsWithRef<'irradianceMaskPass'>, 'args'> {}

export const IrradianceMask = forwardRef<
  IrradianceMaskPass,
  IrradianceMaskProps
>(function IrradianceMask(props, forwardedRef) {
  const { transientStates } = useContext(AtmosphereContext)
  const ref = useRef<IrradianceMaskPass>(null)

  useLayoutEffect(() => {
    if (transientStates != null) {
      transientStates.irradianceMaskBuffer = ref.current?.texture ?? null
      return () => {
        transientStates.irradianceMaskBuffer = null
      }
    }
  }, [transientStates])

  const { scene, camera } = useContext(EffectComposerContext)
  extend({ IrradianceMaskPass })
  return (
    <irradianceMaskPass
      ref={mergeRefs([ref, forwardedRef])}
      {...props}
      args={[scene, camera]}
    />
  )
})
