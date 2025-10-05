import type { Meta } from '@storybook/react-vite'

import { createStory } from '../components/createStory'
import { Story } from './3DTilesRenderer-Story'

import StoryCode from './3DTilesRenderer-Story?raw'

export default {
  title: 'atmosphere/Cityscape',
  tags: ['order:3'],
  parameters: {
    docs: {
      codePanel: true,
      source: {
        language: 'tsx'
      }
    }
  }
} satisfies Meta

export const Cityscape = createStory(Story, {
  props: {
    longitude: -73.9709,
    latitude: 40.7589,
    heading: -155,
    pitch: -35,
    distance: 3000
  },
  args: {
    toneMappingExposure: 60,
    dayOfYear: 1,
    timeOfDay: 7.6
  },
  parameters: {
    docs: {
      source: {
        code: StoryCode
      }
    }
  }
})
