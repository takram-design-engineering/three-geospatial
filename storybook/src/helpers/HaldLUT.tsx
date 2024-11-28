import { useTexture } from '@react-three/drei'
import { LUT, type LUTProps } from '@react-three/postprocessing'
import { type LUT3DEffect } from 'postprocessing'
import { forwardRef, useMemo } from 'react'

import { createHaldLookupTexture } from '@takram/three-geospatial-effects'

export const HaldLUT = /*#__PURE__*/ forwardRef<
  LUT3DEffect,
  Omit<LUTProps, 'lut'> & {
    path: string
  }
>(function HaldLUT({ path, ...props }, forwardedRef) {
  const texture = useTexture(path)
  const lut = useMemo(() => createHaldLookupTexture(texture), [texture])
  return <LUT ref={forwardedRef} lut={lut} {...props} />
})
