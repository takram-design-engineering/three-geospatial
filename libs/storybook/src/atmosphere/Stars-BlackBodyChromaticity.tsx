import { type StoryFn } from '@storybook/react'
import { useMemo } from 'react'
import { Color, Vector2, Vector3 } from 'three'

import {
  convertChromaticityToXYZ,
  convertLinearSRGBToSRGB,
  convertTemperatureToBlackBodyChromaticity,
  convertXYZToLinearSRGBChromaticity
} from '@geovanni/atmosphere'

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
