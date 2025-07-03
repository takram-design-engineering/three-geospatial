import type { ElementProps } from '@react-three/fiber'
import { useEffect, useMemo, type FC } from 'react'

import {
  LensFlareEffect,
  lensFlareEffectOptionsDefaults
} from '../LensFlareEffect'

export interface LensFlareProps extends ElementProps<typeof LensFlareEffect> {}

export const LensFlare: FC<LensFlareProps> = ({
  ref: forwardedRef,
  ...props
}) => {
  const { blendFunction: _, ...others } = {
    ...lensFlareEffectOptionsDefaults,
    ...props
  }

  const effect = useMemo(() => new LensFlareEffect(), [])
  useEffect(() => {
    return () => {
      effect.dispose()
    }
  }, [effect])

  return <primitive ref={forwardedRef} object={effect} {...others} />
}
