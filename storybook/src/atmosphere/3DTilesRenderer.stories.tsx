import type { Meta, StoryFn } from '@storybook/react-vite'

import { Story } from './3DTilesRenderer-Story'

export default {
  title: 'atmosphere/3D Tiles Renderer Integration',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

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
