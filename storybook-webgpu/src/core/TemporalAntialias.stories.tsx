import type { Meta } from '@storybook/react-vite'

import { createStory } from '../components/createStory'
import { Story as TemporalAntialiasStory } from './TemporalAntialias-Story'

import TemporalAntialiasCode from './TemporalAntialias-Story?raw'

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

export const TemporalAntialias = createStory(TemporalAntialiasStory, {
  parameters: {
    docs: {
      source: {
        code: TemporalAntialiasCode
      }
    }
  }
})
