import { type Meta } from '@storybook/react'

export default {
  title: 'atmosphere/Sky',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export const Basic = await import('./Sky-Basic').then(module => module.default)
export const EnvMap = await import('./Sky-EnvMap').then(
  module => module.default
)
