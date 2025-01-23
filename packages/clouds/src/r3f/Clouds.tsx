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

    const cloudsBufferRef = useMemo(
      () => new Uniform(effect.cloudsBuffer),
      [] // eslint-disable-line react-hooks/exhaustive-deps
    )
    const shadowBufferRef = useMemo(
      () => new Uniform(effect.shadowBuffer),
      [] // eslint-disable-line react-hooks/exhaustive-deps
    )
    const shadowFarRef = useMemo(() => new Uniform(0), [])
    const shadowTopHeightRef = useMemo(() => new Uniform(0), [])
    const shadowLengthBufferRef = useMemo(
      () => new Uniform(effect.shadowLengthBuffer),
      [] // eslint-disable-line react-hooks/exhaustive-deps
    )
    useFrame(() => {
      cloudsBufferRef.value = effect.cloudsBuffer
      shadowBufferRef.value = effect.shadowBuffer
      shadowFarRef.value = effect.shadow.far
      shadowTopHeightRef.value = effect.shadowTopHeight
      shadowLengthBufferRef.value = effect.shadowLengthBuffer
    })

    const setComposite = useSetAtom(atoms.compositeAtom)
    useEffect(() => {
      setComposite({
        map: cloudsBufferRef
      })
      return () => {
        setComposite(null)
      }
    }, [effect, setComposite, cloudsBufferRef])

    const setShadow = useSetAtom(atoms.shadowAtom)
    useEffect(() => {
      setShadow({
        map: shadowBufferRef,
        mapSize: effect.shadow.mapSize,
        intervals: effect.shadowIntervals,
        matrices: effect.shadowMatrices,
        far: shadowFarRef,
        topHeight: shadowTopHeightRef
      })
      return () => {
        setShadow(null)
      }
    }, [effect, setShadow, shadowBufferRef, shadowFarRef, shadowTopHeightRef])

    const setShadowLength = useSetAtom(atoms.shadowLengthAtom)
    useEffect(() => {
      if (effect.shadowLength) {
        setShadowLength({
          // @ts-expect-error Ignore
          map: shadowLengthBufferRef
        })
        return () => {
          setShadowLength(null)
        }
      }
    }, [effect, effect.shadowLength, setShadowLength, shadowLengthBufferRef])

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
