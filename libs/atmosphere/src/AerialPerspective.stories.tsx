import { type Meta } from '@storybook/react'

export default {
  title: 'atmosphere/AerialPerspective',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export { Basic } from './stories/AerialPerspective/Basic'
export { PhotorealisticTiles } from './stories/AerialPerspective/PhotorealisticTiles'
export { Shadow } from './stories/AerialPerspective/Shadow'
