import { type Meta } from '@storybook/react'

export default {
  title: 'atmosphere/Sky Light',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export const ForwardLighting = await import('./SkyLight-ForwardLighting').then(
  module => module.default
)
