import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { ToneMapping } from '@react-three/postprocessing'
import { type StoryFn } from '@storybook/react'
import { ToneMappingMode } from 'postprocessing'
import { useRef, type FC } from 'react'
import { Matrix4 } from 'three'

import { getECIToECEFRotationMatrix } from '@geovanni/atmosphere'
import { Stars, type StarsImpl } from '@geovanni/atmosphere/react'
import { EffectComposer } from '@geovanni/effects/react'

import { useLocalDateControls } from '../helpers/useLocalDateControls'
import { useRendererControls } from '../helpers/useRendererControls'

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

  return (
    <>
      <color args={[0, 0, 0]} attach='background' />
      <OrbitControls />
      <Stars
        ref={starsRef}
        dataUrl='/stars.bin'
        scale={[2, 2, 2]}
        radianceScale={5}
        background={false}
      />
      <EffectComposer>
        <ToneMapping mode={ToneMappingMode.AGX} />
      </EffectComposer>
    </>
  )
}

const Story: StoryFn = () => (
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

export default Story
