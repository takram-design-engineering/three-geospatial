import type { Meta } from '@storybook/react-vite'

import { createStory } from '../helpers/createStory'
import { Story as BasicStory } from './Sky-Basic'
import { Story as SceneBackgroundStory } from './Sky-SceneBackground'

import BasicCode from './Sky-Basic?raw'
import SceneBackgroundCode from './Sky-SceneBackground?raw'

export default {
  title: 'atmosphere/Sky',
  parameters: {
    docs: {
      codePanel: true,
      source: {
        language: 'tsx'
      }
    }
  }
} satisfies Meta

export const Basic = createStory(BasicStory, {
  parameters: {
    docs: {
      source: {
        code: BasicCode
      }
    }
  }
})

export const SceneBackground = createStory(SceneBackgroundStory, {
  parameters: {
    docs: {
      source: {
        code: SceneBackgroundCode
      }
    }
  }
})
