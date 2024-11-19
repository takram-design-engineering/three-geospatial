import { useFrame } from '@react-three/fiber'
import { useSpring } from 'framer-motion'
import { useEffect } from 'react'

import { springOptions } from './springOptions'
import { useControls } from './useControls'

export interface RendererControlValues {
  exposure: number
}

export function useRendererControls({
  exposure: initialExposure = 1
}: Partial<RendererControlValues>): RendererControlValues {
  const [values, set] = useControls(
    'renderer',
    () => ({
      exposure: {
        value: initialExposure,
        min: 0,
        max: 100
      }
    }),
    { collapsed: true }
  )

  const { exposure } = values
  const springExposure = useSpring(exposure, springOptions)
  useEffect(() => {
    springExposure.set(exposure)
  }, [exposure, set, springExposure])

  useFrame(({ gl }) => {
    gl.toneMappingExposure = springExposure.get()
  })

  return values
}
