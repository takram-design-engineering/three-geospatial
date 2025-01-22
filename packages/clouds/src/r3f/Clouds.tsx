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

    useFrame(({ camera }) => {
      effect.mainCamera = camera
      if (transientStates != null) {
        effect.sunDirection.copy(transientStates.sunDirection)
        effect.ellipsoidCenter.copy(transientStates.ellipsoidCenter)
        effect.ellipsoidMatrix.copy(transientStates.ellipsoidMatrix)
      }
    })

    const setComposite = useSetAtom(atoms.compositeAtom)
    useEffect(() => {
      setComposite({
        map: effect.cloudsBuffer
      })
      return () => {
        setComposite(null)
      }
    }, [effect, setComposite])

    const setShadow = useSetAtom(atoms.shadowAtom)
    const shadowFarRef = useMemo(() => new Uniform(0), [])
    const shadowTopHeightRef = useMemo(() => new Uniform(0), [])
    useFrame(() => {
      shadowFarRef.value = effect.shadow.far
      shadowTopHeightRef.value = effect.shadowTopHeight
    })
    useEffect(() => {
      setShadow({
        map: effect.shadowBuffer,
        mapSize: effect.shadow.mapSize,
        intervals: effect.shadowIntervals,
        matrices: effect.shadowMatrices,
        far: shadowFarRef,
        topHeight: shadowTopHeightRef
      })
      return () => {
        setShadow(null)
      }
    }, [effect, setShadow, shadowFarRef, shadowTopHeightRef])

    const setShadowLength = useSetAtom(atoms.shadowLengthAtom)
    useEffect(() => {
      if (effect.shadowLengthBuffer != null) {
        setShadowLength({
          map: effect.shadowLengthBuffer
        })
        return () => {
          setShadowLength(null)
        }
      }
    }, [others.shadowLength, effect, setShadowLength])

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
