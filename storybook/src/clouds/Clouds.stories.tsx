import { type Meta } from '@storybook/react'

export default {
  title: 'clouds/Clouds',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export const VolumetricNoise = await import('./Clouds-VolumetricNoise').then(
  module => module.default
)
