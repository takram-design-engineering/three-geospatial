import type { Meta } from '@storybook/react-vite'

import { createStory } from '../components/createStory'
import { Story } from './CruisingAltitude-Story'

import Code from './CruisingAltitude-Story?raw'

export default {
  title: 'atmosphere/Cruising Altitude',
  tags: ['order:2'],
  parameters: {
    docs: {
      codePanel: true,
      source: {
        language: 'tsx'
      }
    }
  }
} satisfies Meta

export const CruisingAltitude = createStory(Story, {
  parameters: {
    docs: {
      source: {
        code: Code
      }
    }
  }
})
