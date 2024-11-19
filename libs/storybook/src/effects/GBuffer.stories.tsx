import { type Meta } from '@storybook/react'

export default {
  title: 'effects/G-Buffer',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export const Basic = await import('./GBuffer-Basic').then(
  module => module.default
)
