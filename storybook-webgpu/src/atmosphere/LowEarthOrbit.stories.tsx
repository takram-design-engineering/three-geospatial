import type { Meta } from '@storybook/react-vite'

import { createStory } from '../components/createStory'
import { Story } from './LowEarthOrbit-Story'

import Code from './LowEarthOrbit-Story?raw'

export default {
  title: 'atmosphere/Low Earth Orbit',
  tags: ['order:1'],
  parameters: {
    docs: {
      codePanel: true,
      source: {
        language: 'tsx'
      }
    }
  }
} satisfies Meta

export const LowEarthOrbit = createStory(Story, {
  parameters: {
    docs: {
      source: {
        code: Code
      }
    }
  }
})
