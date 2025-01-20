import { useFrame } from '@react-three/fiber'
import { EffectComposerContext } from '@react-three/postprocessing'
import { useSetAtom } from 'jotai'
import { forwardRef, useContext, useEffect, useMemo } from 'react'

import { AtmosphereContext, separateProps } from '@takram/three-atmosphere/r3f'
import { type PassThoughInstanceProps } from '@takram/three-geospatial/r3f'

import { CloudsEffect, cloudsEffectOptionsDefaults } from '../CloudsEffect'

export type CloudsProps = PassThoughInstanceProps<
  CloudsEffect,
  [],
  Partial<CloudsEffect>
>

export const Clouds = /*#__PURE__*/ forwardRef<CloudsEffect, CloudsProps>(
  function Clouds(props, forwardedRef) {
    const { textures, transientProps, compositeAtom, ...contextProps } =
      useContext(AtmosphereContext)

    const [atmosphereParameters, others] = separateProps({
      ...cloudsEffectOptionsDefaults,
      ...contextProps,
      ...textures,
      ...props
    })

    const context = useContext(EffectComposerContext)
    const { camera } = context

    const effect = useMemo(() => new CloudsEffect(), [])
    useEffect(() => {
      return () => {
        effect.dispose()
      }
    }, [effect])

    useFrame(({ camera }) => {
      effect.mainCamera = camera
      if (transientProps != null) {
        effect.sunDirection.copy(transientProps.sunDirection)
        effect.ellipsoidCenter.copy(transientProps.ellipsoidCenter)
        effect.ellipsoidMatrix.copy(transientProps.ellipsoidMatrix)
      }
    })

    const setComposite = useSetAtom(compositeAtom)
    useEffect(() => {
      setComposite({
        texture: effect.cloudsBuffer,
        shadow: {
          map: effect.shadowBuffer,
          mapSize: effect.shadow.mapSize,
          intervals: effect.shadowIntervals,
          matrices: effect.shadowMatrices,
          far: effect.shadow.far,
          topHeight: effect.shadowTopHeight
        },
        shadowLengthTexture: effect.shadowLengthBuffer
      })
      return () => {
        setComposite(null)
      }
    }, [setComposite, effect, others.shadowLength])

    return (
      <primitive
        ref={forwardedRef}
        object={effect}
        mainCamera={camera}
        {...atmosphereParameters}
        {...others}
      />
    )
  }
)
