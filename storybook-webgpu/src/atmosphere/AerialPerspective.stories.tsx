import type { Meta } from '@storybook/react-vite'

import { createStory } from '../components/createStory'
import { Story as BasicStory } from './AerialPerspective-Basic'
import { Story as ShadowLengthStory } from './AerialPerspective-ShadowLength'
import { Story as WorldOriginRebasingStory } from './AerialPerspective-WorldOriginRebasing'

import BasicCode from './AerialPerspective-Basic?raw'
import ShadowLengthCode from './AerialPerspective-ShadowLength?raw'
import WorldOriginRebasingCode from './AerialPerspective-WorldOriginRebasing?raw'

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

export const Basic = createStory(BasicStory, {
  props: {
    longitude: 138.5,
    latitude: 36.2,
    height: 1000,
    heading: -90,
    pitch: -20,
    distance: 3000
  },
  parameters: {
    docs: {
      source: {
        code: BasicCode
      }
    }
  }
})

export const ShadowLength = createStory(ShadowLengthStory, {
  props: {
    longitude: 138.5,
    latitude: 36.2,
    height: 1000,
    heading: -90,
    pitch: -20,
    distance: 3000
  },
  parameters: {
    docs: {
      source: {
        code: ShadowLengthCode
      }
    }
  }
})

export const WorldOriginRebasing = createStory(WorldOriginRebasingStory, {
  parameters: {
    docs: {
      source: {
        code: WorldOriginRebasingCode
      }
    }
  }
})
