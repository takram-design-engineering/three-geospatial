import type { Meta } from '@storybook/react-vite'

import { createStory } from '../components/createStory'
import { Story as Art002E000192Story } from './Space-Art002E000192'
import { Story } from './Space-Story'

import Art002E000192Code from './Space-Art002E000192?raw'
import Code from './Space-Story?raw'

export default {
  title: 'atmosphere/Space',
  tags: ['order:0'],
  parameters: {
    docs: {
      codePanel: true,
      source: {
        language: 'tsx'
      }
    }
  }
} satisfies Meta

export const Space = createStory(Story, {
  parameters: {
    docs: {
      source: {
        code: Code
      }
    }
  }
})

export const Art002E000192 = createStory(Art002E000192Story, {
  parameters: {
    docs: {
      source: {
        code: Art002E000192Code
      }
    }
  }
})

Art002E000192.storyName = 'Art002E000192'
