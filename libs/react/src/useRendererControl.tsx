import { useFrame } from '@react-three/fiber'
import { useSpring } from 'framer-motion'
import { useControls } from 'leva'

import { springOptions } from './springOptions'

export function useRendererControl({
  exposure: initialExposure = 10
}: {
  exposure?: number
} = {}): void {
  const { exposure } = useControls('gl', {
    exposure: {
      value: initialExposure,
      min: 0,
      max: 100
    }
  })

  const springExposure = useSpring(exposure, springOptions)
  springExposure.set(exposure)

  useFrame(({ gl }) => {
    gl.toneMappingExposure = springExposure.get()
  })
}
