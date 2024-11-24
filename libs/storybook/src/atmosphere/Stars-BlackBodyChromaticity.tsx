import { type StoryFn } from '@storybook/react'
import { useMemo } from 'react'
import { Color } from 'three'

import { convertTemperatureToLinearSRGBChromaticity } from '@takram/three-atmosphere'

const Story: StoryFn = () => {
  const minTemperature = 1400
  const maxTemperature = 16000

  const gradient = useMemo(() => {
    const color = new Color()
    const colors: string[] = []
    for (let T = minTemperature; T <= maxTemperature; T += 10) {
      convertTemperatureToLinearSRGBChromaticity(T, color)
      const { r, g, b } = color.convertLinearToSRGB()
      colors.push(`rgb(${Math.round(r * 0xff)}, ${g * 0xff}, ${b * 0xff})`)
    }
    const scale = 100 / (colors.length - 1)
    return `linear-gradient(90deg, ${colors.map((color, index) => `${color} ${index * scale}%`).join(', ')})`
  }, [])

  return <div style={{ height: '100%', background: gradient }} />
}

export default Story
