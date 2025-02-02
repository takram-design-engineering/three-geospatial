import { useFrame } from '@react-three/fiber'
import { EffectComposerContext } from '@react-three/postprocessing'
import { useSetAtom } from 'jotai'
import { forwardRef, useCallback, useContext, useEffect, useMemo } from 'react'

import { AtmosphereContext, separateProps } from '@takram/three-atmosphere/r3f'
import {
  type ExpandNestedProps,
  type PassThoughInstanceProps
} from '@takram/three-geospatial/r3f'

import {
  CloudsEffect,
  cloudsEffectOptionsDefaults,
  type CloudsEffectChangeEvent
} from '../CloudsEffect'

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

    const setOverlay = useSetAtom(atoms.overlayAtom)
    const setShadow = useSetAtom(atoms.shadowAtom)
    const setShadowLength = useSetAtom(atoms.shadowLengthAtom)
    const handleChange = useCallback(
      (event: CloudsEffectChangeEvent) => {
        switch (event.property) {
          case 'atmosphereOverlay':
            setOverlay(effect.atmosphereOverlay)
            break
          case 'atmosphereShadow':
            setShadow(effect.atmosphereShadow)
            break
          case 'atmosphereShadowLength':
            setShadowLength(effect.atmosphereShadowLength)
            break
        }
      },
      [effect, setOverlay, setShadow, setShadowLength]
    )
    useEffect(() => {
      effect.addEventListener('change', handleChange)
      return () => {
        effect.removeEventListener('change', handleChange)
      }
    }, [effect, handleChange])

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
