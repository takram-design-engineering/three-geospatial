import type { Meta } from '@storybook/react-vite'

import { createStory } from '../components/createStory'
import { Story } from './ScreenSpaceShadow-Story'

import Code from './ScreenSpaceShadow-Story?raw'

export default {
  title: 'core/Screen Space Shadow',
  parameters: {
    docs: {
      codePanel: true,
      source: {
        language: 'tsx'
      }
    }
  }
} satisfies Meta

export const ScreenSpaceShadow = createStory(Story, {
  parameters: {
    docs: {
      source: {
        code: Code
      }
    }
  }
})
