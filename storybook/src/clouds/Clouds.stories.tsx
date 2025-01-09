import { type Meta } from '@storybook/react'

export default {
  title: 'clouds (WIP)/Clouds',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export const Basic = await import('./Clouds-Basic').then(
  module => module.default
)
export const LocalWeather = await import('./Clouds-LocalWeather').then(
  module => module.default
)
export const Shape = await import('./Clouds-Shape').then(
  module => module.default
)
