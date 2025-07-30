import type { Meta } from '@storybook/react-vite'

import { createStory } from '../helpers/StoryControls'
import { Story as WorldToECEFMatrixStory } from './AerialPerspectiveNode-WorldToECEFMatrix'

export default {
  title: 'atmosphere/Aerial Perspective Node'
} satisfies Meta

export const WorldToECEFMatrix = createStory(WorldToECEFMatrixStory, {
  args: {
    exposure: 10,
    dayOfYear: 0,
    timeOfDay: 9,
    longitude: 30,
    latitude: 0,
    height: 300
  }
})
