import type { Meta } from '@storybook/react-vite'

import { createStory } from '../helpers/createStory'

export default {
  title: 'atmosphere/3D Tiles Renderer Integration',
  parameters: {
    docs: {
      codePanel: true,
      source: {
        language: 'tsx'
      }
    }
  }
} satisfies Meta

export const Manhattan = createStory(
  (await import('./3DTilesRenderer-Story')).Story,
  {
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
          code: (await import('./3DTilesRenderer-Story?raw')).default
        }
      }
    }
  }
)

export const Fuji = createStory(
  (await import('./3DTilesRenderer-Story')).Story,
  {
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
          code: (await import('./3DTilesRenderer-Story?raw')).default
        }
      }
    }
  }
)
