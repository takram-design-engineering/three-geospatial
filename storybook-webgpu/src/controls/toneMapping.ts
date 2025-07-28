import type { ArgTypes } from '@storybook/react-vite'
import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  CineonToneMapping,
  LinearToneMapping,
  NeutralToneMapping,
  ReinhardToneMapping
} from 'three'

export const toneMappingArgTypes: ArgTypes = {
  toneMapping: {
    options: [
      LinearToneMapping,
      ReinhardToneMapping,
      CineonToneMapping,
      ACESFilmicToneMapping,
      AgXToneMapping,
      NeutralToneMapping
    ],
    control: {
      type: 'select',
      labels: {
        [LinearToneMapping]: 'Linear',
        [ReinhardToneMapping]: 'Reinhard',
        [CineonToneMapping]: 'Cineon',
        [ACESFilmicToneMapping]: 'ACES Filmic',
        [AgXToneMapping]: 'AgX',
        [NeutralToneMapping]: 'Neutral'
      }
    },
    table: { category: 'tone mapping' }
  },
  exposure: {
    control: {
      type: 'range',
      min: 1,
      max: 100,
      step: 1
    },
    table: { category: 'tone mapping' }
  }
}
