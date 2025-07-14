import { useFrame, type ElementProps } from '@react-three/fiber'
import { EffectComposerContext } from '@react-three/postprocessing'
import { RenderPass } from 'postprocessing'
import { useContext, useEffect, useMemo, useState, type FC } from 'react'
import { Texture, type Data3DTexture } from 'three'

import { DEFAULT_STBN_URL, STBNLoader } from '@takram/three-geospatial'

import {
  AerialPerspectiveEffect,
  aerialPerspectiveEffectOptionsDefaults
} from '../AerialPerspectiveEffect'
import { AtmosphereContext } from './Atmosphere'
import { separateProps } from './separateProps'

function useLoadSTBNTexture(
  input?: string | Data3DTexture
): Data3DTexture | null {
  const loadedTexture = useMemo(
    () =>
      typeof input === 'string' ? new STBNLoader().load(input) : undefined,
    [input]
  )
  useEffect(() => {
    if (loadedTexture != null) {
      return () => {
        loadedTexture.dispose()
      }
    }
  }, [loadedTexture])
  return (typeof input === 'string' ? loadedTexture : input) ?? null
}

export interface AerialPerspectiveProps
  extends Omit<
    ElementProps<typeof AerialPerspectiveEffect, AerialPerspectiveEffect>,
    'stbnTexture'
  > {
  stbnTexture?: Data3DTexture | string
}

export const AerialPerspective: FC<AerialPerspectiveProps> = ({
  ref: forwardedRef,
  stbnTexture: stbnTextureProp = DEFAULT_STBN_URL,
  ...props
}) => {
  const { textures, transientStates, ...contextProps } =
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

  const [needsSTBN, setNeedsSTBN] = useState(false)

  useFrame(() => {
    if (transientStates != null) {
      effect.sunDirection.copy(transientStates.sunDirection)
      effect.moonDirection.copy(transientStates.moonDirection)
      effect.worldToECEFMatrix.copy(transientStates.worldToECEFMatrix)
      effect.overlay = transientStates.overlay
      effect.shadow = transientStates.shadow
      effect.shadowLength = transientStates.shadowLength
      effect.lightingMask = transientStates.lightingMask

      // Load STBN only when the shadow is first enabled.
      if (!needsSTBN && effect.shadow != null) {
        setNeedsSTBN(true)
      }
    }
  })

  const stbnTexture = useLoadSTBNTexture(
    needsSTBN ? stbnTextureProp : undefined
  )

  return (
    <primitive
      ref={forwardedRef}
      object={effect}
      mainCamera={camera}
      normalBuffer={geometryTexture ?? normalPass?.texture ?? null}
      {...atmosphereParameters}
      {...others}
      stbnTexture={stbnTexture}
      octEncodedNormal={geometryTexture != null}
    />
  )
}
