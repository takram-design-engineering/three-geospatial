import { useFrame, useThree } from '@react-three/fiber'
import { useSpring } from 'framer-motion'
import { type FolderSettings } from 'leva/dist/declarations/src/types'
import { useEffect } from 'react'

import { springOptions } from './springOptions'
import { useControls } from './useControls'

export interface useExposureControlValues {
  exposure: number
}

export function useExposureControls(
  { exposure: initialExposure = 1 }: Partial<useExposureControlValues> = {},
  folderSettings?: FolderSettings
): useExposureControlValues {
  const [values, set] = useControls(
    'exposure',
    () => ({
      exposure: {
        value: initialExposure,
        min: 0,
        max: 100
      }
    }),
    { collapsed: true, ...folderSettings }
  )

  const { exposure } = values
  const springExposure = useSpring(exposure, springOptions)
  useEffect(() => {
    springExposure.set(exposure)
  }, [exposure, set, springExposure])

  useFrame(({ gl }) => {
    gl.toneMappingExposure = springExposure.get()
  })

  const { invalidate } = useThree()
  useEffect(() => {
    return springExposure.on('change', () => {
      invalidate()
    })
  }, [springExposure, invalidate])

  return values
}
