import type { Meta } from '@storybook/react-vite'

import { createStory } from '../components/createStory'
import { Story } from './3DTilesRenderer-Story'

import Code from './3DTilesRenderer-Story?raw'

export default {
  title: 'atmosphere/3D Tiles Renderer Integration',
  globals: {
    backgrounds: { value: 'dark' }
  },
  parameters: {
    docs: {
      codePanel: true,
      source: {
        language: 'tsx'
      }
    }
  }
} satisfies Meta

export const Fuji = createStory(Story, {
  props: {
    longitude: 138.5973,
    latitude: 35.2138,
    heading: 71,
    pitch: -31,
    distance: 7000
  },
  args: {
    toneMappingExposure: 10,
    dayOfYear: 260,
    timeOfDay: 16
  },
  parameters: {
    docs: {
      source: {
        code: Code
      }
    }
  }
})
