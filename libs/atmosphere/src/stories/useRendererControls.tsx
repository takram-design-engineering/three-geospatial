import { useFrame, useThree } from '@react-three/fiber'
import { useSpring } from 'framer-motion'
import { useControls, useStoreContext } from 'leva'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { Material } from 'three'

import { springOptions } from './springOptions'

export interface RendererControlValues {
  exposure: number
  shadow: boolean
}

export function useRendererControls({
  exposure: initialExposure = 1,
  shadow: initialShadow = false
}: Partial<RendererControlValues>): RendererControlValues {
  const store = useStoreContext()
  const [values, set] = useControls(
    'renderer',
    () => ({
      exposure: {
        value: initialExposure,
        min: 0,
        max: 100
      },
      shadow: initialShadow
    }),
    { store }
  )

  const initialValuesRef = useRef({ shadow: initialShadow })
  useEffect(() => {
    set(initialValuesRef.current)
  }, [set])

  const { exposure, shadow } = values

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

  return values
}
