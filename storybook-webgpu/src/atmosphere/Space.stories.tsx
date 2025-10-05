import type { Meta } from '@storybook/react-vite'

import { createStory } from '../components/createStory'
import { Story } from './Space-Story'

import Code from './Space-Story?raw'

export default {
  title: 'atmosphere/Space',
  tags: ['order:0'],
  parameters: {
    docs: {
      codePanel: true,
      source: {
        language: 'tsx'
      }
    }
  }
} satisfies Meta

export const Space = createStory(Story, {
  parameters: {
    docs: {
      source: {
        code: Code
      }
    }
  }
})
