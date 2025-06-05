import { type Meta, type StoryFn } from '@storybook/react'

import { Story } from './3DTilesRenderer-Story'

export default {
  title: 'atmosphere/3D Tiles Renderer Integration',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export const Tokyo: StoryFn = () => <Story exposure={5} />

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

export const Manhattan: StoryFn = () => (
  <Story
    longitude={-73.9709}
    latitude={40.7589}
    heading={-155}
    pitch={-35}
    distance={3000}
    exposure={60}
    dayOfYear={1}
    timeOfDay={7.6}
  />
)
