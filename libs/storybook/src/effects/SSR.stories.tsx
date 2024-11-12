import { type Meta } from '@storybook/react'

export default {
  title: 'effects/SSR',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export const Basic = await import('./SSR-Basic').then(module => module.default)
export const City = await import('./SSR-City').then(module => module.default)
