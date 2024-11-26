import { type Meta } from '@storybook/react'

export default {
  title: 'atmosphere/Stars',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export const Basic = await import('./Stars-Basic').then(
  module => module.default
)
export const BlackBodyChromaticity = await import(
  './Stars-BlackBodyChromaticity'
).then(module => module.default)
