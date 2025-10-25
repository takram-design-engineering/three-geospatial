import type { Meta } from '@storybook/react-vite'

import { createStory } from '../components/createStory'
import { Story } from './ColorBars-Story'

import Code from './ColorBars-Story?raw'

export default {
  title: 'color grading/Color Bars',
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
