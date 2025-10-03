import type { Meta } from '@storybook/react-vite'

import { createStory } from '../components/createStory'
import { Story as BlueMarbleStory } from './BlueMarble-Story'

import BlueMarbleCode from './BlueMarble-Story?raw'

export default {
  title: 'atmosphere/Blue Marble',
  parameters: {
    docs: {
      codePanel: true,
      source: {
        language: 'tsx'
      }
    }
  }
} satisfies Meta

export const BlueMarble = createStory(BlueMarbleStory, {
  parameters: {
    docs: {
      source: {
        code: BlueMarbleCode
      }
    }
  }
})
