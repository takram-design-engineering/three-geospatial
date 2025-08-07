import type { Meta } from '@storybook/react-vite'

import { createStory } from '../helpers/createStory'

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

export const Basic = createStory(
  (await import('./AtmosphereLight-Basic')).Story,
  {
    parameters: {
      docs: {
        source: {
          code: (await import('./AtmosphereLight-Basic?raw')).default
        }
      }
    }
  }
)

export const BlueMarble = createStory(
  (await import('./AtmosphereLight-BlueMarble')).Story,
  {
    parameters: {
      docs: {
        source: {
          code: (await import('./AtmosphereLight-BlueMarble?raw')).default
        }
      }
    }
  }
)

export const ISS = createStory((await import('./AtmosphereLight-ISS')).Story, {
  parameters: {
    docs: {
      source: {
        code: (await import('./AtmosphereLight-ISS?raw')).default
      }
    }
  }
})
