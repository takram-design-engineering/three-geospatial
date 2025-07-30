import type { Meta } from '@storybook/react-vite'

import { createStory } from '../helpers/StoryControls'
import { Story as WorldToECEFMatrixStory } from './AerialPerspective-WorldToECEFMatrix'

export default {
  title: 'atmosphere/Aerial Perspective'
} satisfies Meta

export const WorldToECEFMatrix = createStory(WorldToECEFMatrixStory)
