import type { Meta } from '@storybook/react-vite'

import { createStory } from '../helpers/createStory'
import { Story as LensFlareStory } from './Effects-LensFlare'

import LensFlareCode from './Effects-LensFlare?raw'

export default {
  title: 'core/Effects',
  parameters: {
    docs: {
      codePanel: true,
      source: {
        language: 'tsx'
      }
    }
  }
} satisfies Meta

export const LensFlare = createStory(LensFlareStory, {
  parameters: {
    docs: {
      source: {
        code: LensFlareCode
      }
    }
  }
})
