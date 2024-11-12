import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { ToneMapping } from '@react-three/postprocessing'
import { type Meta, type StoryFn } from '@storybook/react'
import { ToneMappingMode } from 'postprocessing'
import { useMemo, useRef, type FC } from 'react'
import { Matrix4 } from 'three'

import { getECIToECEFRotationMatrix } from '@geovanni/atmosphere'
import { Stars, type StarsImpl } from '@geovanni/atmosphere/react'
import { EffectComposer } from '@geovanni/effects/react'

import { useLocalDateControls } from '../helpers/useLocalDateControls'
import { useRendererControls } from '../helpers/useRendererControls'

export default {
  title: 'atmosphere/Stars',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

const Scene: FC = () => {
  useRendererControls({ exposure: 50 })

  const motionDate = useLocalDateControls()
  const rotationMatrixRef = useRef(new Matrix4())
  const starsRef = useRef<StarsImpl>(null)

  useFrame(() => {
    const date = new Date(motionDate.get())
    getECIToECEFRotationMatrix(date, rotationMatrixRef.current)
    if (starsRef.current != null) {
      starsRef.current.setRotationFromMatrix(rotationMatrixRef.current)
    }
  })

  const effectComposer = useMemo(
    () => (
      <EffectComposer key={Math.random()}>
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    ),
    []
  )
  return (
    <>
      <color args={[0, 0, 0]} attach='background' />
      <OrbitControls />
      <Stars
        ref={starsRef}
        scale={[2, 2, 2]}
        radianceScale={5}
        background={false}
      />
      {effectComposer}
    </>
  )
}

export const Basic: StoryFn = () => (
  <Canvas
    gl={{
      antialias: false,
      depth: false,
      stencil: false
    }}
  >
    <Scene />
  </Canvas>
)
