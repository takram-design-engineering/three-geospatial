import { useLoader, useThree } from '@react-three/fiber'
import { EffectComposerContext } from '@react-three/postprocessing'
import { forwardRef, useContext, useEffect, useMemo } from 'react'

import {
  type EffectComposerContextValue,
  type EffectProps
} from '@geovanni/effects/react'

import {
  AerialPerspectiveEffect,
  aerialPerspectiveEffectOptionsDefaults,
  type AerialPerspectiveEffectOptions
} from '../AerialPerspectiveEffect'
import { PrecomputedTexturesLoader } from '../PrecomputedTexturesLoader'
import { AtmosphereContext } from './Atmosphere'

export interface AerialPerspectiveProps
  extends EffectProps<
    typeof AerialPerspectiveEffect,
    AerialPerspectiveEffectOptions
  > {}

export const AerialPerspective = forwardRef<
  AerialPerspectiveEffect,
  AerialPerspectiveProps
>(function AerialPerspective(props, forwardedRef) {
  const context = useContext(AtmosphereContext)

  const { blendFunction, ...others } = {
    ...aerialPerspectiveEffectOptionsDefaults,
    ...context,
    ...props
  }

  // TODO: Make the texture paths configurable.
  const gl = useThree(({ gl }) => gl)
  const useHalfFloat = useMemo(
    () => gl.getContext().getExtension('OES_texture_float_linear') == null,
    [gl]
  )
  const precomputedTextures = useLoader(PrecomputedTexturesLoader, '/')

  const { geometryPass, normalPass, camera } = useContext(
    EffectComposerContext
  ) as EffectComposerContextValue

  const effect = useMemo(
    () => new AerialPerspectiveEffect(camera, { blendFunction }),
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
      camera={camera}
      normalBuffer={
        geometryPass?.geometryTexture ?? normalPass?.texture ?? null
      }
      {...precomputedTextures}
      useHalfFloat={useHalfFloat}
      {...others}
      octEncodedNormal={geometryPass?.geometryTexture != null}
    />
  )
})
