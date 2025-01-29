import { type Meta, type StoryFn } from '@storybook/react'

import { Story } from './3DTilesRenderer-Story'

export default {
  title: 'clouds (WIP)/3D Tiles Renderer',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export const Tokyo: StoryFn = () => (
  <Story
    timeOfDay={14}
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
    dayOfYear={200}
    timeOfDay={5.5}
    exposure={10}
    longitude={138.802}
    latitude={35.1345}
    heading={60}
    pitch={-12}
    distance={1950}
  />
)

export const London: StoryFn = () => (
  <Story
    dayOfYear={0}
    timeOfDay={11}
    exposure={15}
    longitude={-0.1293}
    latitude={51.4836}
    heading={-94}
    pitch={-7}
    distance={3231}
    coverage={0.45}
  />
)
