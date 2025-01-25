import { useFrame } from '@react-three/fiber'
import { EffectComposerContext } from '@react-three/postprocessing'
import { useSetAtom } from 'jotai'
import { forwardRef, useContext, useEffect, useMemo } from 'react'
import { Uniform } from 'three'

import { AtmosphereContext, separateProps } from '@takram/three-atmosphere/r3f'
import {
  type ExpandNestedProps,
  type PassThoughInstanceProps
} from '@takram/three-geospatial/r3f'

import { CloudsEffect, cloudsEffectOptionsDefaults } from '../CloudsEffect'

export type CloudsProps = PassThoughInstanceProps<
  CloudsEffect,
  [],
  Partial<
    CloudsEffect &
      ExpandNestedProps<CloudsEffect, 'resolution'> &
      ExpandNestedProps<CloudsEffect, 'shadow'>
  >
>

export const Clouds = /*#__PURE__*/ forwardRef<CloudsEffect, CloudsProps>(
  function Clouds(props, forwardedRef) {
    const { textures, transientStates, atoms, ...contextProps } =
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

    useFrame(() => {
      if (transientStates != null) {
        effect.sunDirection.copy(transientStates.sunDirection)
        effect.ellipsoidCenter.copy(transientStates.ellipsoidCenter)
        effect.ellipsoidMatrix.copy(transientStates.ellipsoidMatrix)
      }
    })

    const setComposite = useSetAtom(atoms.compositeAtom)
    useEffect(() => {
      setComposite({
        map: effect.cloudsBufferRef
      })
      return () => {
        setComposite(null)
      }
    }, [effect, setComposite])

    const setShadow = useSetAtom(atoms.shadowAtom)
    useEffect(() => {
      setShadow({
        map: effect.shadowBufferRef,
        mapSize: effect.shadowMapSize,
        intervals: effect.shadowIntervals,
        matrices: effect.shadowMatrices,
        far: effect.shadowFarRef,
        topHeight: effect.shadowTopHeightRef
      })
      return () => {
        setShadow(null)
      }
    }, [effect, setShadow])

    const setShadowLength = useSetAtom(atoms.shadowLengthAtom)
    useEffect(() => {
      if (effect.crepuscularRays) {
        setShadowLength({
          // @ts-expect-error Ignore
          map: effect.shadowLengthBufferRef
        })
        return () => {
          setShadowLength(null)
        }
      }
    }, [effect, effect.crepuscularRays, setShadowLength])

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
