import type { Meta } from '@storybook/react-vite'

import { createStory } from '../components/createStory'
import { Story } from './TemporalAntialias-Story'

import Code from './TemporalAntialias-Story?raw'

export default {
  title: 'core/Temporal Antialias',
  parameters: {
    docs: {
      codePanel: true,
      source: {
        language: 'tsx'
      }
    }
  }
} satisfies Meta

export const TemporalAntialias = createStory(Story, {
  parameters: {
    docs: {
      source: {
        code: Code
      }
    }
  }
})
