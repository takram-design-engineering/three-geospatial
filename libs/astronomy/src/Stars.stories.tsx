import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { ToneMapping } from '@react-three/postprocessing'
import { type Meta, type StoryFn } from '@storybook/react'
import { useControls } from 'leva'
import { ToneMappingMode } from 'postprocessing'
import { useMemo, type FC } from 'react'
import { Color, Vector2, Vector3 } from 'three'

import { EffectComposer } from '@geovanni/effects'
import { useRendererControl } from '@geovanni/react'

import {
  convertChromaticityToXYZ,
  convertLinearSRGBToSRGB,
  convertTemperatureToBlackBodyChromaticity,
  convertXYZToLinearSRGBChromaticity
} from './colors'
import { Stars } from './Stars'

export default {
  title: 'astronomy/Stars',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

const Scene: FC = () => {
  useRendererControl()

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
      <Stars scale={[2, 2, 2]} />
      {effectComposer}
    </>
  )
}

export const Basic: StoryFn = () => {
  const { exposure } = useControls('gl', {
    exposure: { value: 50, min: 0, max: 100 }
  })
  return (
    <Canvas
      gl={{
        antialias: false,
        depth: false,
        stencil: false,
        toneMappingExposure: exposure
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
