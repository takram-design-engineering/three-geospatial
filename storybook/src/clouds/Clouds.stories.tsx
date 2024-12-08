import { type Meta } from '@storybook/react'

export default {
  title: 'clouds/Clouds',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export const Volume = await import('./Clouds-Volume').then(module => module.default)
