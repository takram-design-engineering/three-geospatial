import type { Meta } from '@storybook/react-vite'

import { createStory } from '../components/createStory'
import { Story } from './ColorBars'

import Code from './ColorBars?raw'

export default {
  title: 'color grading/Color Bars',
  globals: {
    backgrounds: { value: 'dark' }
  },
  parameters: {
    docs: {
      codePanel: true,
      source: {
        language: 'tsx'
      }
    }
  }
} satisfies Meta

export const ColorBars = createStory(Story, {
  parameters: {
    docs: {
      source: {
        code: Code
      }
    }
  }
})
