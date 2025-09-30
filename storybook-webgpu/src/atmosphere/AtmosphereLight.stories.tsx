import type { Meta } from '@storybook/react-vite'

import { createStory } from '../helpers/createStory'
import { Story as BasicStory } from './AtmosphereLight-Basic'
import { Story as VanillaStory } from './AtmosphereLight-Vanilla'

import BasicCode from './AtmosphereLight-Basic?raw'
import VanillaCode from './AtmosphereLight-Vanilla?raw'

export default {
  title: 'atmosphere/Atmosphere Light',
  parameters: {
    docs: {
      codePanel: true,
      source: {
        language: 'tsx'
      }
    }
  }
} satisfies Meta

export const Basic = createStory(BasicStory, {
  parameters: {
    docs: {
      source: {
        code: BasicCode
      }
    }
  }
})

export const Vanilla = createStory(VanillaStory, {
  parameters: {
    docs: {
      source: {
        code: VanillaCode
      }
    }
  }
})
