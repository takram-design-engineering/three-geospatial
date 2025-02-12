import { useFrame } from '@react-three/fiber'
import { EffectComposerContext } from '@react-three/postprocessing'
import { RenderPass } from 'postprocessing'
import { forwardRef, useContext, useEffect, useMemo, useState } from 'react'
import { Texture, type Data3DTexture } from 'three'

import { DEFAULT_STBN_URL, STBNLoader } from '@takram/three-geospatial'
import { type PassThoughInstanceProps } from '@takram/three-geospatial/r3f'

import {
  AerialPerspectiveEffect,
  aerialPerspectiveEffectOptionsDefaults
} from '../AerialPerspectiveEffect'
import { AtmosphereContext } from './Atmosphere'
import { separateProps } from './separateProps'

function useSTBNTextureState(
  input?: string | Data3DTexture
): Data3DTexture | null {
  const [data, setData] = useState(
    typeof input !== 'string' ? (input ?? null) : null
  )
  useEffect(() => {
    if (typeof input === 'string') {
      const loader = new STBNLoader()
      ;(async () => {
        setData(await loader.loadAsync(input))
      })().catch(error => {
        console.error(error)
      })
    } else {
      setData(input ?? null)
    }
  }, [input])

  return data
}

export type AerialPerspectiveProps = Omit<
  PassThoughInstanceProps<
    AerialPerspectiveEffect,
    [],
    Partial<AerialPerspectiveEffect>
  >,
  'stbnTexture'
> & {
  stbnTexture?: Data3DTexture | string
}

export const AerialPerspective = /*#__PURE__*/ forwardRef<
  AerialPerspectiveEffect,
  AerialPerspectiveProps
>(function AerialPerspective(
  { stbnTexture: stbnTextureProp = DEFAULT_STBN_URL, ...props },
  forwardedRef
) {
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
      effect.ellipsoidCenter.copy(transientStates.ellipsoidCenter)
      effect.ellipsoidMatrix.copy(transientStates.ellipsoidMatrix)
      effect.overlay = transientStates.overlay
      effect.shadow = transientStates.shadow
      effect.shadowLength = transientStates.shadowLength

      // Load STBN only when the shadow is first enabled.
      if (!needsSTBN && effect.shadow != null) {
        setNeedsSTBN(true)
      }
    }
  })

  const stbnTexture = useSTBNTextureState(
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
})
