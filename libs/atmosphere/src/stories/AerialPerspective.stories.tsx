import { type Meta } from '@storybook/react'

export default {
  title: 'atmosphere/AerialPerspective',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export { Basic } from './AerialPerspective-Basic'
export { ForwardLighting } from './AerialPerspective-ForwardLighting'
export { PhotorealisticTiles } from './AerialPerspective-PhotorealisticTiles'
