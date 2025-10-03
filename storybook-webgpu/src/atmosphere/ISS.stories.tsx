import type { Meta } from '@storybook/react-vite'

import { createStory } from '../components/createStory'
import { Story as ISSStory } from './ISS-Story'

import ISSCode from './ISS-Story?raw'

export default {
  title: 'atmosphere/ISS',
  parameters: {
    docs: {
      codePanel: true,
      source: {
        language: 'tsx'
      }
    }
  }
} satisfies Meta

export const ISS = createStory(ISSStory, {
  parameters: {
    docs: {
      source: {
        code: ISSCode
      }
    }
  }
})
