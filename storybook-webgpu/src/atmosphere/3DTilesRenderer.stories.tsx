import type { Meta } from '@storybook/react-vite'

import { createStory } from '../components/createStory'
import { Story as LightSourceLightingStory } from './3DTilesRenderer-LightSourceLighting'
import { Story as PostProcessLightingStory } from './3DTilesRenderer-PostProcessLighting'
import { Story as ShadowsStory } from './3DTilesRenderer-Shadows'

import LightSourceLightingCode from './3DTilesRenderer-LightSourceLighting?raw'
import PostProcessLightingCode from './3DTilesRenderer-PostProcessLighting?raw'
import ShadowsCode from './3DTilesRenderer-Shadows?raw'

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

export const LightSourceLighting = createStory(LightSourceLightingStory, {
  props: {
    longitude: 139.8146,
    latitude: 35.7455,
    heading: -110,
    pitch: -9,
    distance: 1000
  },
  args: {
    toneMappingExposure: 10,
    dayOfYear: 170,
    timeOfDay: 7.5
  },
  parameters: {
    docs: {
      source: {
        code: LightSourceLightingCode
      }
    }
  }
})

export const PostProcessLighting = createStory(PostProcessLightingStory, {
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
        code: PostProcessLightingCode
      }
    }
  }
})

export const Shadows = createStory(ShadowsStory, {
  props: {
    longitude: 138.2761,
    latitude: 35.7057,
    heading: -55,
    pitch: -26,
    distance: 11128,
    csmFar: 5e4
  },
  args: {
    toneMappingExposure: 35,
    dayOfYear: 260,
    timeOfDay: 17.7
  },
  parameters: {
    docs: {
      source: {
        code: ShadowsCode
      }
    }
  }
})
