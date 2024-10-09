import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { ToneMapping } from '@react-three/postprocessing'
import { type Meta, type StoryFn } from '@storybook/react'
import { ToneMappingMode } from 'postprocessing'
import { useMemo, type FC } from 'react'
import { Color, Vector2, Vector3 } from 'three'

import {
  convertChromaticityToXYZ,
  convertLinearSRGBToSRGB,
  convertTemperatureToBlackBodyChromaticity,
  convertXYZToLinearSRGBChromaticity
} from '@geovanni/core'
import { EffectComposer } from '@geovanni/effects'
import { useRendererControls } from '@geovanni/react'

import { Stars } from './Stars'

export default {
  title: 'atmosphere/Stars',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

const Scene: FC = () => {
  useRendererControls({ exposure: 50 })

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
      <Stars scale={[2, 2, 2]} radianceScale={5} disableTransform />
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
