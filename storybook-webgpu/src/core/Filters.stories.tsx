import type { Meta } from '@storybook/react-vite'

import { createStory } from '../helpers/createStory'
import { Story as GaussianBlurStory } from './Filters-GaussianBlur'
import { Story as MipmapBloomBlurStory } from './Filters-MipmapBloomBlur'

import GaussianBlurCode from './Filters-GaussianBlur?raw'
import MipmapBloomBlurCode from './Filters-MipmapBloomBlur?raw'

export default {
  title: 'core/Filters',
  parameters: {
    docs: {
      codePanel: true,
      source: {
        language: 'tsx'
      }
    }
  }
} satisfies Meta

export const GaussianBlur = createStory(GaussianBlurStory, {
  parameters: {
    docs: {
      source: {
        code: GaussianBlurCode
      }
    }
  }
})

export const MipmapBloomBlur = createStory(MipmapBloomBlurStory, {
  parameters: {
    docs: {
      source: {
        code: MipmapBloomBlurCode
      }
    }
  }
})
