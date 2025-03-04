import { type ElementProps } from '@react-three/fiber'
import { forwardRef, useEffect, useMemo } from 'react'

import {
  LensFlareEffect,
  lensFlareEffectOptionsDefaults
} from '../LensFlareEffect'

export interface LensFlareProps extends ElementProps<typeof LensFlareEffect> {}

export const LensFlare = /*#__PURE__*/ forwardRef<
  LensFlareEffect,
  LensFlareProps
>(function LensFlare(props, forwardedRef) {
  const { blendFunction, ...others } = {
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
})
