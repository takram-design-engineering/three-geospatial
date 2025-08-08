import type { Meta } from '@storybook/react-vite'

import { createStory } from '../helpers/createStory'
import { Story as BasicStory } from './AtmosphereLight-Basic'
import { Story as BlueMarbleStory } from './AtmosphereLight-BlueMarble'
import { Story as ISSStory } from './AtmosphereLight-ISS'

import BasicCode from './AtmosphereLight-Basic?raw'
import BlueMarbleCode from './AtmosphereLight-BlueMarble?raw'
import ISSCode from './AtmosphereLight-ISS?raw'

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

export const BlueMarble = createStory(BlueMarbleStory, {
  parameters: {
    docs: {
      source: {
        code: BlueMarbleCode
      }
    }
  }
})

export const ISS = createStory(ISSStory, {
  parameters: {
    docs: {
      source: {
        code: ISSCode
      }
    }
  }
})
