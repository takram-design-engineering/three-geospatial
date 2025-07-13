import { applyProps, useFrame, useThree } from '@react-three/fiber'
import { useContext, useEffect, useMemo, type FC, type Ref } from 'react'
import { Vector2 } from 'three'

import type { FrustumSplitMode } from '@takram/three-geospatial'
import type { OverwriteMathProps } from '@takram/three-geospatial/r3f'

import { SceneShadowMaps } from '../SceneShadowMaps'
import { AtmosphereContext } from './Atmosphere'

export interface SceneShadowProps
  extends OverwriteMathProps<{
    ref?: Ref<SceneShadowMaps>

    // CascadedShadow
    cascadeCount?: number
    mapSize?: Vector2
    maxFar?: number | null
    farScale?: number
    splitMode?: FrustumSplitMode
    splitLambda?: number
    margin?: number
    fade?: boolean
  }> {}

export const SceneShadow: FC<SceneShadowProps> = ({
  ref: forwardedRef,
  ...props
}) => {
  const maps = useMemo(
    () =>
      new SceneShadowMaps({
        cascadeCount: 2,
        mapSize: new Vector2().setScalar(1024)
      }),
    []
  )
  useEffect(() => {
    return () => {
      maps.dispose()
    }
  }, [maps])

  const scene = useThree(({ scene }) => scene)
  const camera = useThree(({ camera }) => camera)
  const { transientStates } = useContext(AtmosphereContext)
  useFrame(() => {
    if (transientStates != null) {
      maps.update(scene, camera, transientStates.sunDirection)
    }
  })

  useEffect(() => {
    if (transientStates != null) {
      transientStates.sceneShadow = maps
      return () => {
        transientStates.sceneShadow = null
      }
    }
  }, [maps, transientStates])

  useEffect(() => {
    if (typeof forwardedRef === 'function') {
      forwardedRef(maps)
    } else if (forwardedRef != null) {
      forwardedRef.current = maps
    }
  }, [forwardedRef, maps])

  applyProps(maps, props)
  return null
}
