import type { Meta } from '@storybook/react-vite'

import { createStory } from '../components/createStory'
import { Story } from './LensFlare-Story'

import Code from './LensFlare-Story?raw'

export default {
  title: 'core/Lens Flare',
  parameters: {
    docs: {
      codePanel: true,
      source: {
        language: 'tsx'
      }
    }
  }
} satisfies Meta

export const LensFlare = createStory(Story, {
  parameters: {
    docs: {
      source: {
        code: Code
      }
    }
  }
})
