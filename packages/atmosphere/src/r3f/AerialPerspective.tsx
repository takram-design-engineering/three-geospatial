import { useFrame } from '@react-three/fiber'
import { EffectComposerContext } from '@react-three/postprocessing'
import { useAtomValue } from 'jotai'
import { RenderPass } from 'postprocessing'
import { forwardRef, useContext, useEffect, useMemo } from 'react'
import { Texture } from 'three'

import { type PassThoughInstanceProps } from '@takram/three-geospatial/r3f'

import {
  AerialPerspectiveEffect,
  aerialPerspectiveEffectOptionsDefaults
} from '../AerialPerspectiveEffect'
import { AtmosphereContext } from './Atmosphere'
import { separateProps } from './separateProps'

export type AerialPerspectiveProps = PassThoughInstanceProps<
  AerialPerspectiveEffect,
  [],
  Partial<AerialPerspectiveEffect>
>

export const AerialPerspective = /*#__PURE__*/ forwardRef<
  AerialPerspectiveEffect,
  AerialPerspectiveProps
>(function AerialPerspective(props, forwardedRef) {
  const { textures, stbn, transientStates, atoms, ...contextProps } =
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

  const overlay = useAtomValue(atoms.overlayAtom)
  useEffect(() => {
    effect.overlay = overlay
  }, [effect, overlay])

  const shadow = useAtomValue(atoms.shadowAtom)
  useEffect(() => {
    effect.shadow = shadow
  }, [effect, shadow])

  const shadowLength = useAtomValue(atoms.shadowLengthAtom)
  useEffect(() => {
    effect.shadowLength = shadowLength
  }, [effect, shadowLength])

  useFrame(() => {
    if (transientStates != null) {
      effect.sunDirection.copy(transientStates.sunDirection)
      effect.moonDirection.copy(transientStates.moonDirection)
      effect.ellipsoidCenter.copy(transientStates.ellipsoidCenter)
      effect.ellipsoidMatrix.copy(transientStates.ellipsoidMatrix)
    }
  })

  return (
    <primitive
      ref={forwardedRef}
      object={effect}
      mainCamera={camera}
      normalBuffer={geometryTexture ?? normalPass?.texture ?? null}
      {...atmosphereParameters}
      stbnTexture={stbn}
      {...others}
      octEncodedNormal={geometryTexture != null}
    />
  )
})
