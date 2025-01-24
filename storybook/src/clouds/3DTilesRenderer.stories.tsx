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
    exposure={10}
    longitude={139.8146}
    latitude={35.7455}
    heading={-110}
    pitch={-9}
    distance={1000}
  />
)
