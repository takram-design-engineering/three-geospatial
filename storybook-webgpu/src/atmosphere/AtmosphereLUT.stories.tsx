import type { Meta } from '@storybook/react-vite'

import { createStory } from '../helpers/createStory'
import { Story as Story2D } from './AtmosphereLUT-2D'
import { Story as Story3D } from './AtmosphereLUT-3D'

export default {
  title: 'atmosphere/Atmosphere LUT'
} satisfies Meta

export const Transmittance = createStory(Story2D, {
  props: {
    name: 'transmittance'
  },
  args: {
    zoom: 4,
    toneMappingExposure: 1
  }
})

export const Irradiance = createStory(Story2D, {
  props: {
    name: 'irradiance'
  },
  args: {
    zoom: 16,
    toneMappingExposure: 100
  }
})

export const Scattering = createStory(Story3D, {
  props: {
    name: 'scattering'
  },
  args: {
    zoom: 2,
    toneMappingExposure: 0.5
  }
})

export const SingleMieScattering = createStory(Story3D, {
  props: {
    name: 'singleMieScattering',
    combinedScatteringTextures: false
  },
  args: {
    zoom: 2,
    toneMappingExposure: 0.5
  }
})

export const HigherOrderScattering = createStory(Story3D, {
  props: {
    name: 'higherOrderScattering'
  },
  args: {
    zoom: 2,
    toneMappingExposure: 0.5
  }
})
