import { type Meta } from '@storybook/react'

export default {
  title: 'atmosphere/Atmosphere',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export const Basic = await import('./Atmosphere-Basic').then(
  module => module.default
)
export const Vanilla = await import('./Atmosphere-Vanilla').then(
  module => module.default
)
