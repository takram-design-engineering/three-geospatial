import { LUT, type LUTProps } from '@react-three/postprocessing'
import { type LUT3DEffect } from 'postprocessing'
import { forwardRef } from 'react'

import { useHaldLookupTexture } from '@geovanni/effects/react'

export const HaldLUT = forwardRef<
  LUT3DEffect,
  Omit<LUTProps, 'lut'> & {
    path: string
  }
>(function HaldLUT({ path, ...props }, forwardedRef) {
  const texture = useHaldLookupTexture(path)
  return <LUT ref={forwardedRef} lut={texture} {...props} />
})
