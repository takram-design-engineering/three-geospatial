import { EffectComposerContext } from '@react-three/postprocessing'
import { forwardRef, useContext, useEffect, useMemo } from 'react'

import {
  SSREffect,
  ssrEffectOptionsDefaults,
  type SSREffectOptions
} from '../SSREffect'
import { type EffectComposerContextValue } from './EffectComposer'
import { type EffectProps } from './types'

export interface SSRProps
  extends EffectProps<typeof SSREffect, SSREffectOptions> {}

export const SSR = /*#__PURE__*/ forwardRef<SSREffect, SSRProps>(
  function SSR(props, forwardedRef) {
    const { blendFunction, ...others } = {
      ...ssrEffectOptionsDefaults,
      ...props
    }

    const { geometryPass, camera } = useContext(
      EffectComposerContext
    ) as EffectComposerContextValue

    const effect = useMemo(
      () => new SSREffect(camera, { blendFunction }),
      [camera, blendFunction]
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
        mainCamera={camera}
        geometryBuffer={geometryPass?.geometryTexture}
        {...others}
      />
    )
  }
)
