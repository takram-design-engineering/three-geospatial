import { forwardRef, useMemo } from 'react'

import {
  LensFlareEffect,
  lensFlareEffectOptionsDefaults,
  type LensFlareEffectOptions
} from './LensFlareEffect'
import { type EffectProps } from './types'

export interface LensFlareProps
  extends EffectProps<typeof LensFlareEffect, LensFlareEffectOptions> {}

export const LensFlare = forwardRef<LensFlareEffect, LensFlareProps>(
  function LensFlare(props, forwardedRef) {
    const { blendFunction, ...others } = {
      ...lensFlareEffectOptionsDefaults,
      ...props
    }
    const effect = useMemo(() => new LensFlareEffect(), [])
    return <primitive ref={forwardedRef} object={effect} {...others} />
  }
)
