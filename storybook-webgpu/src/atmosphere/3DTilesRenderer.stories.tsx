import type { Meta } from '@storybook/react-vite'

import { createStory } from '../helpers/StoryControls'
import { Story } from './3DTilesRenderer-Story'

export default {
  title: 'atmosphere/3D Tiles Renderer Integration'
} satisfies Meta

export const Manhattan = createStory(
  Story,
  {
    longitude: -73.9709,
    latitude: 40.7589,
    heading: -155,
    pitch: -35,
    distance: 3000
  },
  {
    exposure: 60,
    dayOfYear: 1,
    timeOfDay: 7.6
  }
)

export const Fuji = createStory(
  Story,
  {
    longitude: 138.5973,
    latitude: 35.2138,
    heading: 71,
    pitch: -31,
    distance: 7000
  },
  {
    exposure: 10,
    dayOfYear: 260,
    timeOfDay: 16
  }
)
