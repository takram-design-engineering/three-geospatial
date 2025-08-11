import type { Meta } from '@storybook/react-vite'

import { createStory } from '../helpers/createStory'
import { Story as BasicStory } from './Sky-Basic'
import { Story as MoonStory } from './Sky-Moon'
import { Story as SceneBackgroundStory } from './Sky-SceneBackground'

import BasicCode from './Sky-Basic?raw'
import MoonCode from './Sky-Moon?raw'
import SceneBackgroundCode from './Sky-SceneBackground?raw'

export default {
  title: 'atmosphere/Sky',
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

export const SceneBackground = createStory(SceneBackgroundStory, {
  parameters: {
    docs: {
      source: {
        code: SceneBackgroundCode
      }
    }
  }
})

export const Moon = createStory(MoonStory, {
  parameters: {
    docs: {
      source: {
        code: MoonCode
      }
    }
  }
})

export const MoonSurface = createStory(MoonStory, {
  args: {
    zoom: 75,
    showOverlay: false,
    trackMoon: true,
    dayOfYear: 65,
    timeOfDay: 16.5,
    longitude: 139.7528,
    latitude: 35.6852
  },
  parameters: {
    docs: {
      source: {
        code: MoonCode
      }
    }
  }
})
