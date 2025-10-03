import type { Meta } from '@storybook/react-vite'

import { createStory } from '../components/createStory'
import { Story as LensFlareStory } from './LensFlare-Story'

import LensFlareCode from './LensFlare-Story?raw'

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

export const LensFlare = createStory(LensFlareStory, {
  parameters: {
    docs: {
      source: {
        code: LensFlareCode
      }
    }
  }
})
