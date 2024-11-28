import { LUT, type LUTProps } from '@react-three/postprocessing'
import { type LUT3DEffect } from 'postprocessing'
import { forwardRef } from 'react'

import { useHaldLookupTexture } from '@takram/three-geospatial-effects/r3f'

export const HaldLUT = /*#__PURE__*/ forwardRef<
  LUT3DEffect,
  Omit<LUTProps, 'lut'> & {
    path: string
  }
>(function HaldLUT({ path, ...props }, forwardedRef) {
  const texture = useHaldLookupTexture(path)
  return <LUT ref={forwardedRef} lut={texture} {...props} />
})
