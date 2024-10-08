import { useFrame } from '@react-three/fiber'
import { useSpring } from 'framer-motion'
import { useControls } from 'leva'
import { useEffect } from 'react'

import { springOptions } from './springOptions'

export function useRendererControls({
  exposure: initialExposure = 10
}: {
  exposure?: number
} = {}): void {
  const [{ exposure }, set] = useControls('gl', () => ({
    exposure: {
      value: initialExposure,
      min: 0,
      max: 100
    }
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
}
