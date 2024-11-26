import { EffectComposerContext } from '@react-three/postprocessing'
import { forwardRef, useContext, useEffect, useMemo } from 'react'

import {
  NormalEffect,
  normalEffectOptionsDefaults,
  type NormalEffectOptions
} from '../NormalEffect'
import { type EffectComposerContextValue } from './EffectComposer'
import { type EffectProps } from './types'

export interface NormalProps
  extends EffectProps<typeof NormalEffect, NormalEffectOptions> {}

export const Normal = /*#__PURE__*/ forwardRef<NormalEffect, NormalProps>(
  function Normal(props, forwardedRef) {
    const { blendFunction, ...others } = {
      ...normalEffectOptionsDefaults,
      ...props
    }

    const { geometryPass, normalPass, camera } = useContext(
      EffectComposerContext
    ) as EffectComposerContextValue

    const effect = useMemo(
      () => new NormalEffect(camera, { blendFunction }),
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
        normalBuffer={
          geometryPass?.geometryTexture ?? normalPass?.texture ?? null
        }
        {...others}
        octEncoded={geometryPass?.geometryTexture != null}
      />
    )
  }
)
