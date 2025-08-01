import type { Meta } from '@storybook/react-vite'

import { createStory } from '../helpers/createStory'
import { Story as BasicStory } from './AtmosphereLight-Basic'
import { Story as BlueMarbleStory } from './AtmosphereLight-BlueMarble'
import { Story as ISSStory } from './AtmosphereLight-ISS'

export default {
  title: 'atmosphere/Atmosphere Light'
} satisfies Meta

export const Basic = createStory(BasicStory)

export const BlueMarble = createStory(BlueMarbleStory)

export const ISS = createStory(ISSStory)
