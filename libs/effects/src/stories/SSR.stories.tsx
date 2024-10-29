import { type Meta } from '@storybook/react'

export default {
  title: 'effects/SSR',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export { Basic } from './SSR-Basic'
export { City } from './SSR-City'
