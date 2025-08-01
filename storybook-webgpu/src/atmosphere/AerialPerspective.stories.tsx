import type { Meta } from '@storybook/react-vite'

import { createStory } from '../helpers/createStory'
import { Story as BasicStory } from './AerialPerspective-Basic'
import { Story as WorldOriginRebasingStory } from './AerialPerspective-WorldOriginRebasing'

export default {
  title: 'atmosphere/Aerial Perspective'
} satisfies Meta

export const Basic = createStory(BasicStory, {
  props: {
    longitude: 138.5,
    latitude: 36.2,
    height: 5000,
    heading: -90,
    pitch: -20,
    distance: 2000
  }
})

export const WorldOriginRebasing = createStory(WorldOriginRebasingStory)
