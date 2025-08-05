import type { Meta } from '@storybook/react-vite'

import { createStory } from '../helpers/createStory'
import { Story as BasicStory } from './Sky-Basic'
import { Story as SceneBackgroundStory } from './Sky-SceneBackground'

export default {
  title: 'atmosphere/Sky'
} satisfies Meta

export const Basic = createStory(BasicStory)
export const SceneBackground = createStory(SceneBackgroundStory)
