import type { Meta } from '@storybook/react-vite'

import { createStory } from '../components/createStory'
import { Story as LandscapeStory } from './ScreenSpaceShadow-Landscape'
import { Story as NemetonaStory } from './ScreenSpaceShadow-Nemetona'

import LandscapeCode from './ScreenSpaceShadow-Landscape?raw'
import NemetonaCode from './ScreenSpaceShadow-Nemetona?raw'

export default {
  title: 'core/Screen Space Shadow',
  parameters: {
    docs: {
      codePanel: true,
      source: {
        language: 'tsx'
      }
    }
  }
} satisfies Meta

export const Nemetona = createStory(NemetonaStory, {
  parameters: {
    docs: {
      source: {
        code: NemetonaCode
      }
    }
  }
})

export const Landscape = createStory(LandscapeStory, {
  parameters: {
    docs: {
      source: {
        code: LandscapeCode
      }
    }
  }
})
