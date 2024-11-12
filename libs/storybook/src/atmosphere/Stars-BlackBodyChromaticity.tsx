import { type StoryFn } from '@storybook/react'
import { useMemo } from 'react'
import { Color } from 'three'

import { convertTemperatureToLinearSRGBChromaticity } from '@geovanni/atmosphere'

function applyCompanding(x: number): number {
  return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055
}

export function convertLinearSRGBToSRGB(
  { r, g, b }: Color,
  result = new Color()
): Color {
  return result.setRGB(
    applyCompanding(r),
    applyCompanding(g),
    applyCompanding(b)
  )
}

const Story: StoryFn = () => {
  const minTemperature = 1400
  const maxTemperature = 16000

  const gradient = useMemo(() => {
    const color = new Color()
    const colors: string[] = []
    for (let T = minTemperature; T <= maxTemperature; T += 10) {
      convertTemperatureToLinearSRGBChromaticity(T, color)
      const { r, g, b } = convertLinearSRGBToSRGB(color, color)
      colors.push(`rgb(${Math.round(r * 0xff)}, ${g * 0xff}, ${b * 0xff})`)
    }
    const scale = 100 / (colors.length - 1)
    return `linear-gradient(90deg, ${colors.map((color, index) => `${color} ${index * scale}%`).join(', ')})`
  }, [])

  return <div style={{ height: '100%', background: gradient }} />
}

export default Story
