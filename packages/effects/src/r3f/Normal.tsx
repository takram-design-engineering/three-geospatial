import type { ElementProps } from '@react-three/fiber'
import { EffectComposerContext } from '@react-three/postprocessing'
import { useContext, useEffect, useMemo, type FC } from 'react'

import { NormalEffect, normalEffectOptionsDefaults } from '../NormalEffect'
import type { EffectComposerContextValue } from './EffectComposer'

export interface NormalProps extends ElementProps<typeof NormalEffect> {}

export const Normal: FC<NormalProps> = ({ ref: forwardedRef, ...props }) => {
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
