import type { Meta } from '@storybook/react-vite'

import { createStory } from '../helpers/createStory'
import { Story as AerialPerspectiveStory } from './Vanilla-AerialPerspective'
import { Story as AtmosphereLightStory } from './Vanilla-AtmosphereLight'
import { Story as WorldOriginRebasingStory } from './Vanilla-WorldOriginRebasing'

import AerialPerspectiveCode from './Vanilla-AerialPerspective?raw'
import AtmosphereLightCode from './Vanilla-AtmosphereLight?raw'
import WorldOriginRebasingCode from './Vanilla-WorldOriginRebasing?raw'

export default {
  title: 'atmosphere/Vanilla',
  parameters: {
    docs: {
      codePanel: true,
      source: {
        language: 'tsx'
      }
    }
  }
} satisfies Meta

export const AtmosphereLight = createStory(AtmosphereLightStory, {
  parameters: {
    docs: {
      source: {
        code: AtmosphereLightCode
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

export const AerialPerspective = createStory(AerialPerspectiveStory, {
  parameters: {
    docs: {
      source: {
        code: AerialPerspectiveCode
      }
    }
  }
})
