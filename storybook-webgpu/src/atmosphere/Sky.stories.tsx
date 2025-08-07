import type { Meta } from '@storybook/react-vite'

import { createStory } from '../helpers/createStory'

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

export const Basic = createStory((await import('./Sky-Basic')).Story, {
  parameters: {
    docs: {
      source: {
        code: (await import('./Sky-Basic?raw')).default
      }
    }
  }
})

export const SceneBackground = createStory(
  (await import('./Sky-SceneBackground')).Story,
  {
    parameters: {
      docs: {
        source: {
          code: (await import('./Sky-SceneBackground?raw')).default
        }
      }
    }
  }
)
