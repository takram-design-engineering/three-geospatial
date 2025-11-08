import type { Meta } from '@storybook/react-vite'

import { createStory } from '../components/createStory'
import { Story } from './Gradient'

import Code from './Gradient?raw'

export default {
  title: 'color grading/Gradient',
  parameters: {
    docs: {
      codePanel: true,
      source: {
        language: 'tsx'
      }
    }
  }
} satisfies Meta

export const Gradient = createStory(Story, {
  parameters: {
    docs: {
      source: {
        code: Code
      }
    }
  }
})
