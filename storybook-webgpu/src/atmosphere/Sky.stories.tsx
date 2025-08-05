import type { Meta } from '@storybook/react-vite'

import { createStory } from '../helpers/createStory'
import { Story as BackgroundStory } from './Sky-Background'
import { Story as BasicStory } from './Sky-Basic'

export default {
  title: 'atmosphere/Sky'
} satisfies Meta

export const Basic = createStory(BasicStory)
export const Background = createStory(BackgroundStory)
