import { type Meta, type StoryFn } from '@storybook/react'

import { Story } from './PhotorealisticTiles-Story'

export default {
  title: 'clouds/Photorealistic Tiles',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export const Tokyo: StoryFn = () => (
  <Story
    exposure={10}
    longitude={139.8196}
    latitude={35.7545}
    heading={-130}
    pitch={-9}
    distance={1300}
  />
)
