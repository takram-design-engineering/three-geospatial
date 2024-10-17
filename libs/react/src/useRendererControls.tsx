import { useFrame, useThree } from '@react-three/fiber'
import { useSpring } from 'framer-motion'
import { useControls } from 'leva'
import { useEffect, useLayoutEffect } from 'react'
import { Material } from 'three'

import { springOptions } from './springOptions'

export function useRendererControls({
  exposure: initialExposure = 10,
  shadow: initialShadow = false
}: {
  exposure?: number
  shadow?: boolean
} = {}): void {
  const [{ exposure, shadow }, set] = useControls('renderer', () => ({
    exposure: {
      value: initialExposure,
      min: 0,
      max: 100
    },
    shadow: initialShadow
  }))

  const springExposure = useSpring(exposure, springOptions)

  useEffect(() => {
    set({ exposure: initialExposure })
    springExposure.jump(initialExposure)
  }, [initialExposure, set, springExposure])

  useEffect(() => {
    springExposure.set(exposure)
  }, [exposure, set, springExposure])

  useFrame(({ gl }) => {
    gl.toneMappingExposure = springExposure.get()
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
}
