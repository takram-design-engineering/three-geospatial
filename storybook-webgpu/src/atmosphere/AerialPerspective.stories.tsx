import type { Meta } from '@storybook/react-vite'

import { createStory } from '../helpers/createStory'
import { Story as WorldOriginRebasingStory } from './AerialPerspective-WorldOriginRebasing'

export default {
  title: 'atmosphere/Aerial Perspective'
} satisfies Meta

export const WorldOriginRebasing = createStory(WorldOriginRebasingStory)
