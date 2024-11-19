import { type Meta } from '@storybook/react'

export default {
  title: 'effects/Lens Flare',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export const Basic = await import('./LensFlare-Basic').then(
  module => module.default
)
