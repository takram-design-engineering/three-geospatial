import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { ToneMapping } from '@react-three/postprocessing'
import { type Meta, type StoryFn } from '@storybook/react'
import { ToneMappingMode } from 'postprocessing'
import { useMemo, useRef, type FC } from 'react'
import { Color, Matrix4, Vector2, Vector3 } from 'three'

import {
  convertChromaticityToXYZ,
  convertLinearSRGBToSRGB,
  convertTemperatureToBlackBodyChromaticity,
  convertXYZToLinearSRGBChromaticity,
  getECIToECEFRotationMatrix
} from '@geovanni/core'
import { EffectComposer } from '@geovanni/effects'

import { Stars, type StarsImpl } from './Stars'
import { useLocalDateControls } from './stories/useLocalDateControls'
import { useRendererControls } from './stories/useRendererControls'

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

export const Basic: StoryFn = () => {
  return (
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
}

export const BlackBodyChromaticity: StoryFn = () => {
  const minTemperature = 1400
  const maxTemperature = 16000

  const gradient = useMemo(() => {
    const vector2 = new Vector2()
    const vector3 = new Vector3()
    const color = new Color()
    const colors: string[] = []
    for (let T = minTemperature; T <= maxTemperature; T += 10) {
      const xy = convertTemperatureToBlackBodyChromaticity(T, vector2)
      const XYZ = convertChromaticityToXYZ(xy, 1, vector3)
      convertXYZToLinearSRGBChromaticity(XYZ, color)
      const { r, g, b } = convertLinearSRGBToSRGB(color, color)
      colors.push(`rgb(${Math.round(r * 0xff)}, ${g * 0xff}, ${b * 0xff})`)
    }
    const scale = 100 / (colors.length - 1)
    return `linear-gradient(90deg, ${colors.map((color, index) => `${color} ${index * scale}%`).join(', ')})`
  }, [])

  return <div style={{ height: '100%', background: gradient }} />
}
