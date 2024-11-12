import { type Meta } from '@storybook/react'

export default {
  title: 'atmosphere/Aerial Perspective',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export const Basic = await import('./AerialPerspective-Basic').then(
  module => module.default
)
export const PhotorealisticTiles = await import(
  './AerialPerspective-PhotorealisticTiles'
).then(module => module.default)
