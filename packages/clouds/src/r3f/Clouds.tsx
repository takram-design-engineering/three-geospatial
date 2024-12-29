import { useFrame, type Node } from '@react-three/fiber'
import { EffectComposerContext } from '@react-three/postprocessing'
import { useSetAtom } from 'jotai'
import { type BlendFunction } from 'postprocessing'
import { forwardRef, useContext, useEffect, useMemo } from 'react'

import { AtmosphereContext, separateProps } from '@takram/three-atmosphere/r3f'

import {
  CloudsEffect,
  cloudsEffectOptionsDefaults,
  type CloudsEffectOptions
} from '../CloudsEffect'

export type CloudsProps = Node<
  InstanceType<typeof CloudsEffect>,
  CloudsEffect
> &
  CloudsEffectOptions & {
    blendFunction?: BlendFunction
    opacity?: number
  }

export const Clouds = /*#__PURE__*/ forwardRef<CloudsEffect, CloudsProps>(
  function Clouds(props, forwardedRef) {
    const { textures, transientProps, compositeAtom, ...contextProps } =
      useContext(AtmosphereContext)

    const [atmosphereParameters, { blendFunction, ...others }] = separateProps({
      ...cloudsEffectOptionsDefaults,
      ...contextProps,
      ...textures,
      ...props
    })

    const context = useContext(EffectComposerContext)
    const { camera } = context

    const effect = useMemo(
      () => new CloudsEffect(undefined, { blendFunction }),
      [blendFunction]
    )
    useEffect(() => {
      return () => {
        effect.dispose()
      }
    }, [effect])

    useFrame(({ camera }) => {
      effect.mainCamera = camera
      if (transientProps != null) {
        effect.sunDirection.copy(transientProps.sunDirection)
      }
    })

    const setComposite = useSetAtom(compositeAtom)
    useEffect(() => {
      setComposite({
        texture: effect.cloudsRenderTarget.texture,
        shadow: {
          texture: effect.shadowRenderTarget.texture,
          matrices: effect.shadowMatrices,
          cascades: effect.cascadedShadows.cascades,
          far: effect.cascadedShadows.far
        }
      })
      return () => {
        setComposite(null)
      }
    }, [setComposite, effect])

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
