import { EffectComposerContext } from '@react-three/postprocessing'
import { forwardRef, useContext, useEffect, useMemo } from 'react'

import {
  GeometryEffect,
  geometryEffectOptionsDefaults,
  type GeometryEffectOptions
} from '../GeometryEffect'
import { type EffectComposerContextValue } from './EffectComposer'
import { type EffectProps } from './types'

export interface GeometryProps
  extends EffectProps<typeof GeometryEffect, GeometryEffectOptions> {}

export const Geometry = /*#__PURE__*/ forwardRef<GeometryEffect, GeometryProps>(
  function Geometry(props, forwardedRef) {
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
)
