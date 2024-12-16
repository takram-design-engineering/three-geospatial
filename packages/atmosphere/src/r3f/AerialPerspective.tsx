import { useFrame, type Node } from '@react-three/fiber'
import { EffectComposerContext } from '@react-three/postprocessing'
import { RenderPass, type BlendFunction } from 'postprocessing'
import { forwardRef, useContext, useEffect, useMemo } from 'react'
import { Texture } from 'three'

import {
  AerialPerspectiveEffect,
  aerialPerspectiveEffectOptionsDefaults,
  type AerialPerspectiveEffectOptions
} from '../AerialPerspectiveEffect'
import { AtmosphereContext } from './Atmosphere'
import { separateProps } from './separateProps'

export type AerialPerspectiveProps = Node<
  InstanceType<typeof AerialPerspectiveEffect>,
  AerialPerspectiveEffect
> &
  AerialPerspectiveEffectOptions & {
    blendFunction?: BlendFunction
    opacity?: number
  }

export const AerialPerspective = /*#__PURE__*/ forwardRef<
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

  const context = useContext(EffectComposerContext)
  const { normalPass, camera } = context
  const geometryTexture =
    'geometryPass' in context &&
    context.geometryPass instanceof RenderPass &&
    'geometryTexture' in context.geometryPass &&
    context.geometryPass.geometryTexture instanceof Texture
      ? context.geometryPass.geometryTexture
      : undefined

  const effect = useMemo(
    () => new AerialPerspectiveEffect(undefined, { blendFunction }),
    [blendFunction]
  )

  useEffect(() => {
    return () => {
      effect.dispose()
    }
  }, [effect])

  useFrame(() => {
    if (transientProps != null) {
      effect.sunDirection.copy(transientProps.sunDirection)
      effect.moonDirection.copy(transientProps.moonDirection)
    }
  })

  return (
    <primitive
      ref={forwardedRef}
      object={effect}
      mainCamera={camera}
      normalBuffer={geometryTexture ?? normalPass?.texture ?? null}
      {...atmosphereParameters}
      {...others}
      octEncodedNormal={geometryTexture != null}
    />
  )
})
