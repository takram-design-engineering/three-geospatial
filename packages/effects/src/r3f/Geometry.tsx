import type { ElementProps } from '@react-three/fiber'
import { EffectComposerContext } from '@react-three/postprocessing'
import { useContext, useEffect, useMemo, type FC } from 'react'

import {
  GeometryEffect,
  geometryEffectOptionsDefaults
} from '../GeometryEffect'
import type { EffectComposerContextValue } from './EffectComposer'

export interface GeometryProps extends ElementProps<typeof GeometryEffect> {}

export const Geometry: FC<GeometryProps> = ({
  ref: forwardedRef,
  ...props
}) => {
  const { blendFunction, ...others } = {
    ...geometryEffectOptionsDefaults,
    ...props
  }

  const { geometryPass } = useContext(
    EffectComposerContext
  ) as EffectComposerContextValue

  const effect = useMemo(
    () => new GeometryEffect({ blendFunction }),
    [blendFunction]
  )
  useEffect(() => {
    return () => {
      effect.dispose()
    }
  }, [effect])

  return (
    <primitive
      ref={forwardedRef}
      object={effect}
      geometryBuffer={geometryPass?.geometryTexture}
      {...others}
    />
  )
}
