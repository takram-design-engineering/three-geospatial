import { type Meta } from '@storybook/react'

export default {
  title: 'atmosphere/Sky',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export const Basic = await import('./Sky-Basic').then(module => module.default)
export const EnvironmentMap = await import('./Sky-EnvironmentMap').then(
  module => module.default
)
