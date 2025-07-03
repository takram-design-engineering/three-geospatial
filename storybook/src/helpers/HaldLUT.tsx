import { useTexture } from '@react-three/drei'
import { LUT, type LUTProps } from '@react-three/postprocessing'
import type { LUT3DEffect } from 'postprocessing'
import { useMemo, type FC, type RefAttributes } from 'react'

import { createHaldLookupTexture } from '@takram/three-geospatial-effects'

export const HaldLUT: FC<
  Omit<LUTProps & RefAttributes<LUT3DEffect>, 'lut'> & {
    path: string
  }
> = ({ ref: forwardedRef, path, ...props }) => {
  const texture = useTexture(path)
  const lut = useMemo(() => createHaldLookupTexture(texture), [texture])
  return <LUT ref={forwardedRef} lut={lut} {...props} />
}
