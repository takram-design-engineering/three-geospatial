import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { EffectComposer, ToneMapping } from '@react-three/postprocessing'
import { type StoryFn } from '@storybook/react'
import { useRef, type FC } from 'react'
import { Matrix4 } from 'three'

import { getECIToECEFRotationMatrix } from '@takram/three-atmosphere'
import { Stars, type StarsImpl } from '@takram/three-atmosphere/r3f'

import { useLocalDateControls } from '../helpers/useLocalDateControls'
import { useToneMappingControls } from '../helpers/useToneMappingControls'

const Scene: FC = () => {
  const { toneMappingMode } = useToneMappingControls({ exposure: 50 })
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
        data='atmosphere/stars.bin'
        scale={[2, 2, 2]}
        radianceScale={5}
        background={false}
      />
      <EffectComposer multisampling={0}>
        <ToneMapping mode={toneMappingMode} />
      </EffectComposer>
    </>
  )
}

const Story: StoryFn = () => (
  <Canvas gl={{ depth: false }}>
    <Scene />
  </Canvas>
)

export default Story
