import type { Meta } from '@storybook/react-vite'

import { createStory } from '../components/createStory'
import { Story } from './Stratosphere-Story'

import Code from './Stratosphere-Story?raw'

export default {
  title: 'atmosphere/Stratosphere',
  parameters: {
    docs: {
      codePanel: true,
      source: {
        language: 'tsx'
      }
    }
  }
} satisfies Meta

export const Stratosphere = createStory(Story, {
  parameters: {
    docs: {
      source: {
        code: Code
      }
    }
  }
})
