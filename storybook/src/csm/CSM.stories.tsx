import { type Meta } from '@storybook/react'

export default {
  title: 'csm/CSM',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export const Basic = await import('./CSM-Basic').then(module => module.default)
