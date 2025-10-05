import type { Meta } from '@storybook/react-vite'

import { createStory } from '../components/createStory'
import { Story as NonGeospatialStory } from './NonGeospatial-Story'

import NonGeospatialCode from './NonGeospatial-Story?raw'

export default {
  title: 'atmosphere/Non-geospatial',
  tags: ['order:4'],
  parameters: {
    docs: {
      codePanel: true,
      source: {
        language: 'tsx'
      }
    }
  }
} satisfies Meta

export const NonGeospatial = createStory(NonGeospatialStory, {
  parameters: {
    docs: {
      source: {
        code: NonGeospatialCode
      }
    }
  }
})

NonGeospatial.storyName = 'Non-geospatial'
