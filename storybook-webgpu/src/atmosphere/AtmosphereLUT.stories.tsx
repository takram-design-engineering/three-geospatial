import type { ArgTypes, Meta } from '@storybook/react-vite'

import { createStory } from '../helpers/createStory'
import Story2D from './AtmosphereLUT-2D'
import Story3D from './AtmosphereLUT-3D'

export default {
  title: 'atmosphere/Atmosphere LUT'
} satisfies Meta

const argTypes: ArgTypes = {
  zoom: {
    control: {
      type: 'range',
      min: 1,
      max: 32,
      step: 0.1
    },
    table: { category: 'display' }
  },
  valueExponent: {
    control: {
      type: 'range',
      min: -5,
      max: 5,
      step: 0.1
    },
    table: { category: 'display' }
  }
}

export const Transmittance = createStory(Story2D, {
  props: {
    name: 'transmittance'
  },
  args: {
    zoom: 4,
    valueExponent: 0
  },
  argTypes
})

export const Irradiance = createStory(Story2D, {
  props: {
    name: 'irradiance'
  },
  args: {
    zoom: 16,
    valueExponent: 2
  },
  argTypes
})

export const Scattering = createStory(Story3D, {
  props: {
    name: 'scattering'
  },
  args: {
    zoom: 2,
    valueExponent: Math.log10(0.5)
  },
  argTypes
})

export const SingleMieScattering = createStory(Story3D, {
  props: {
    name: 'singleMieScattering',
    combinedScatteringTextures: false
  },
  args: {
    zoom: 2,
    valueExponent: Math.log10(0.5)
  },
  argTypes
})

export const HigherOrderScattering = createStory(Story3D, {
  props: {
    name: 'higherOrderScattering'
  },
  args: {
    zoom: 2,
    valueExponent: Math.log10(0.5)
  },
  argTypes
})
