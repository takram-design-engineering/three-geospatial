import type { Meta } from '@storybook/react-vite'

import { createStory } from '../components/createStory'
import { Story as DownsampleThresholdStory } from './Filters-DownsampleThreshold'
import { Story as GaussianBlurStory } from './Filters-GaussianBlur'
import { Story as KawaseBlurStory } from './Filters-KawaseBlur'
import { Story as MipmapBlurStory } from './Filters-MipmapBlur'
import { Story as MipmapSurfaceBlurStory } from './Filters-MipmapSurfaceBlur'

import DownsampleThresholdCode from './Filters-DownsampleThreshold?raw'
import GaussianBlurCode from './Filters-GaussianBlur?raw'
import KawaseBlurCode from './Filters-KawaseBlur?raw'
import MipmapBlurCode from './Filters-MipmapBlur?raw'
import MipmapSurfaceBlurCode from './Filters-MipmapSurfaceBlur?raw'

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

export const MipmapSurfaceBlur = createStory(MipmapSurfaceBlurStory, {
  parameters: {
    docs: {
      source: {
        code: MipmapSurfaceBlurCode
      }
    }
  }
})

export const DownsampleThreshold = createStory(DownsampleThresholdStory, {
  parameters: {
    docs: {
      source: {
        code: DownsampleThresholdCode
      }
    }
  }
})
