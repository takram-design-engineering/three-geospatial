import { type Meta } from '@storybook/react'

export default {
  title: 'atmosphere/Stars',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export { Basic } from './Stars-Basic'
export { BlackBodyChromaticity } from './Stars-BlackBodyChromaticity'
