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
  CloudsPass,
  cloudsPassOptionsDefaults,
  type CloudsPassChangeEvent
} from '../CloudsPass'

export type CloudsProps = PassThoughInstanceProps<
  CloudsPass,
  [],
  Partial<
    CloudsPass &
      ExpandNestedProps<CloudsPass, 'resolution'> &
      ExpandNestedProps<CloudsPass, 'shadow'>
  >
>

export const Clouds = /*#__PURE__*/ forwardRef<CloudsPass, CloudsProps>(
  function Clouds(props, forwardedRef) {
    const { textures, transientStates, atoms, ...contextProps } =
      useContext(AtmosphereContext)

    const [atmosphereParameters, others] = separateProps({
      ...cloudsPassOptionsDefaults,
      ...contextProps,
      ...textures,
      ...props
    })

    const context = useContext(EffectComposerContext)
    const { camera } = context

    const pass = useMemo(() => new CloudsPass(), [])
    useEffect(() => {
      return () => {
        pass.dispose()
      }
    }, [pass])

    useFrame(() => {
      if (transientStates != null) {
        pass.sunDirection.copy(transientStates.sunDirection)
        pass.ellipsoidCenter.copy(transientStates.ellipsoidCenter)
        pass.ellipsoidMatrix.copy(transientStates.ellipsoidMatrix)
      }
    })

    const setOverlay = useSetAtom(atoms.overlayAtom)
    const setShadow = useSetAtom(atoms.shadowAtom)
    const setShadowLength = useSetAtom(atoms.shadowLengthAtom)
    const handleChange = useCallback(
      (event: CloudsPassChangeEvent) => {
        switch (event.property) {
          case 'atmosphereOverlay':
            setOverlay(pass.atmosphereOverlay)
            break
          case 'atmosphereShadow':
            setShadow(pass.atmosphereShadow)
            break
          case 'atmosphereShadowLength':
            setShadowLength(pass.atmosphereShadowLength)
            break
        }
      },
      [pass, setOverlay, setShadow, setShadowLength]
    )
    useEffect(() => {
      pass.events.addEventListener('change', handleChange)
      return () => {
        pass.events.removeEventListener('change', handleChange)
      }
    }, [pass, handleChange])

    return (
      <primitive
        ref={forwardedRef}
        object={pass}
        mainCamera={camera}
        {...atmosphereParameters}
        {...others}
      />
    )
  }
)
