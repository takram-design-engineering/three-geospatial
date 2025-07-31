import type { Meta } from '@storybook/react-vite'

import { createStory } from '../helpers/createStory'
import { Story as BasicStory } from './AtmosphereLight-Basic'
import { Story as TerrainStory } from './AtmosphereLight-Terrain'

export default {
  title: 'atmosphere/Atmosphere Light'
} satisfies Meta

export const Basic = createStory(BasicStory)

export const Terrain = createStory(TerrainStory, {
  props: {
    longitude: 138.5,
    latitude: 36.2,
    height: 5000,
    heading: -90,
    pitch: -20,
    distance: 2000
  }
})
