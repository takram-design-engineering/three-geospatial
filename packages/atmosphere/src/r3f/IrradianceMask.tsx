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

import { IrradianceMaskPass } from '../IrradianceMaskPass'
import { AtmosphereContext } from './Atmosphere'

declare module '@react-three/fiber' {
  interface ThreeElements {
    irradianceMaskPass: ThreeElement<typeof IrradianceMaskPass>
  }
}

export interface IrradianceMaskProps
  extends Omit<ComponentPropsWithoutRef<'irradianceMaskPass'>, 'args'> {
  ref?: Ref<IrradianceMaskPass>
}

export const IrradianceMask: FC<IrradianceMaskProps> = ({
  ref: forwardedRef,
  ...props
}) => {
  const { transientStates } = useContext(AtmosphereContext)
  const ref = useRef<IrradianceMaskPass>(null)

  useEffect(() => {
    if (ref.current == null) {
      return
    }
    if (transientStates != null) {
      transientStates.irradianceMask = {
        map: ref.current.texture,
        channel: 'r'
      }
      return () => {
        transientStates.irradianceMask = null
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
}
