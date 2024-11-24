import { useFrame } from '@react-three/fiber'
import { EffectComposerContext } from '@react-three/postprocessing'
import { forwardRef, useContext, useEffect, useMemo } from 'react'

import {
  type EffectComposerContextValue,
  type EffectProps
} from '@geovanni/effects/r3f'

import {
  AerialPerspectiveEffect,
  aerialPerspectiveEffectOptionsDefaults,
  type AerialPerspectiveEffectOptions
} from '../AerialPerspectiveEffect'
import { AtmosphereContext } from './Atmosphere'
import { separateProps } from './separateProps'

export interface AerialPerspectiveProps
  extends EffectProps<
    typeof AerialPerspectiveEffect,
    AerialPerspectiveEffectOptions
  > {}

export const AerialPerspective = forwardRef<
  AerialPerspectiveEffect,
  AerialPerspectiveProps
>(function AerialPerspective(props, forwardedRef) {
  const { textures, transientProps, ...contextProps } =
    useContext(AtmosphereContext)

  const [atmosphereParameters, { blendFunction, ...others }] = separateProps({
    ...aerialPerspectiveEffectOptionsDefaults,
    ...contextProps,
    ...textures,
    ...props
  })

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

  useFrame(() => {
    if (transientProps != null) {
      effect.sunDirection.copy(transientProps.sunDirection)
    }
  })

  return (
    <primitive
      ref={forwardedRef}
      object={effect}
      camera={camera}
      normalBuffer={
        geometryPass?.geometryTexture ?? normalPass?.texture ?? null
      }
      {...atmosphereParameters}
      {...others}
      octEncodedNormal={geometryPass?.geometryTexture != null}
    />
  )
})
