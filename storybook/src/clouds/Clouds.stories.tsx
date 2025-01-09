import { type Meta } from '@storybook/react'

export default {
  title: 'clouds/Clouds',
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
export const ShapeViewer = await import('./Clouds-ShapeViewer').then(
  module => module.default
)
