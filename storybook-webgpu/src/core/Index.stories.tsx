import type { Meta } from '@storybook/react-vite'

import { createStory } from '../helpers/createStory'
import { Story as LensFlareStory } from './Index-LensFlare'

import LensFlareCode from './Index-LensFlare?raw'

export default {
  title: 'core',
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
