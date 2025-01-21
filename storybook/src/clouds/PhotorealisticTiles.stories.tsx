import { type Meta, type StoryFn } from '@storybook/react'

import { Story } from './PhotorealisticTiles-Story'

export default {
  title: 'clouds (WIP)/Photorealistic Tiles',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export const Tokyo: StoryFn = () => (
  <Story
    exposure={10}
    longitude={139.8146}
    latitude={35.7455}
    heading={-110}
    pitch={-9}
    distance={1000}
  />
)

export const Fuji: StoryFn = () => (
  <Story
    longitude={138.5973}
    latitude={35.2138}
    heading={71}
    pitch={-31}
    distance={7000}
    exposure={10}
    dayOfYear={260}
    timeOfDay={16}
  />
)
