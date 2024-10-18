import { useFrame, useThree } from '@react-three/fiber'
import { useSpring } from 'framer-motion'
import { useControls } from 'leva'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { Material, Vector3 } from 'three'

import { SUN_SPECTRAL_RADIANCE_TO_LUMINANCE } from '../constants'
import { springOptions } from './springOptions'

const luminanceScale = new Vector3(0.2126, 0.7152, 0.0722).dot(
  SUN_SPECTRAL_RADIANCE_TO_LUMINANCE
)

export interface RendererControlValues {
  exposure: number
  photometric: boolean
  shadow: boolean
}

export function useRendererControls({
  exposure: initialExposure = 10,
  photometric: initialPhotometric = true,
  shadow: initialShadow = false
}: Partial<RendererControlValues>): RendererControlValues {
  const [values, set] = useControls('renderer', () => ({
    exposure: {
      value: initialExposure,
      min: 0,
      max: 100
    },
    photometric: initialPhotometric,
    shadow: initialShadow
  }))

  // These are story-dependent; don't keep the values between stories.
  const initialValuesRef = useRef({
    photometric: initialPhotometric,
    shadow: initialShadow
  })
  useEffect(() => {
    set({
      photometric: initialValuesRef.current.photometric,
      shadow: initialValuesRef.current.shadow
    })
  }, [set])

  const { exposure, photometric, shadow } = values

  const springExposure = useSpring(exposure, springOptions)

  useEffect(() => {
    set({ exposure: initialExposure })
    springExposure.jump(initialExposure)
  }, [initialExposure, set, springExposure])

  useEffect(() => {
    springExposure.set(exposure)
  }, [exposure, set, springExposure])

  useFrame(({ gl }) => {
    gl.toneMappingExposure =
      springExposure.get() / (photometric ? luminanceScale : 1)
  })

  const { gl, scene } = useThree()
  useLayoutEffect(() => {
    gl.shadowMap.enabled = shadow
    scene.traverse(child => {
      if ('material' in child && child.material instanceof Material) {
        child.material.needsUpdate = true
      }
    })
  }, [shadow, gl, scene])

  return values
}
