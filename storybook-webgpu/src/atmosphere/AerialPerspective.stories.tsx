import type { Meta } from '@storybook/react-vite'

import { createStory } from '../helpers/createStory'

export default {
  title: 'atmosphere/Aerial Perspective',
  parameters: {
    docs: {
      codePanel: true,
      source: {
        language: 'tsx'
      }
    }
  }
} satisfies Meta

export const Basic = createStory(
  (await import('./AerialPerspective-Basic')).Story,
  {
    props: {
      longitude: 138.5,
      latitude: 36.2,
      height: 5000,
      heading: -90,
      pitch: -20,
      distance: 2000
    },
    parameters: {
      docs: {
        source: {
          code: (await import('./AerialPerspective-Basic?raw')).default
        }
      }
    }
  }
)

export const WorldOriginRebasing = createStory(
  (await import('./AerialPerspective-WorldOriginRebasing')).Story,
  {
    parameters: {
      docs: {
        source: {
          code: (await import('./AerialPerspective-WorldOriginRebasing?raw'))
            .default
        }
      }
    }
  }
)
