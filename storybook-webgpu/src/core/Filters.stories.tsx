import type { Meta } from '@storybook/react-vite'

import { createStory } from '../helpers/createStory'
import { Story as GaussianBlurStory } from './Filters-GaussianBlur'
import { Story as KawaseBlurStory } from './Filters-KawaseBlur'
import { Story as MipmapBloomStory } from './Filters-MipmapBloom'
import { Story as MipmapBlurStory } from './Filters-MipmapBlur'

import GaussianBlurCode from './Filters-GaussianBlur?raw'
import KawaseBlurCode from './Filters-KawaseBlur?raw'
import MipmapBloomCode from './Filters-MipmapBloom?raw'
import MipmapBlurCode from './Filters-MipmapBlur?raw'

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

export const KawaseBlur = createStory(KawaseBlurStory, {
  parameters: {
    docs: {
      source: {
        code: KawaseBlurCode
      }
    }
  }
})

export const MipmapBlur = createStory(MipmapBlurStory, {
  parameters: {
    docs: {
      source: {
        code: MipmapBlurCode
      }
    }
  }
})

export const MipmapBloom = createStory(MipmapBloomStory, {
  parameters: {
    docs: {
      source: {
        code: MipmapBloomCode
      }
    }
  }
})
