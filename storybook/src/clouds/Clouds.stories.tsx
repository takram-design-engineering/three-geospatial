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
export const MovingEllipsoid = await import('./Clouds-MovingEllipsoid').then(
  module => module.default
)
