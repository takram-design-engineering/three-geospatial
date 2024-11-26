import { type Meta } from '@storybook/react'

export default {
  title: 'core/Camera',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export const PointOfView = await import('./Camera-PointOfView').then(
  module => module.default
)
