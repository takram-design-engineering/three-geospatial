import type { ArgTypes } from '@storybook/react-vite'
import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  CineonToneMapping,
  LinearToneMapping,
  NeutralToneMapping,
  ReinhardToneMapping,
  type ToneMapping
} from 'three'

export interface ToneMappingArgTypes {
  toneMapping: ToneMapping
  exposure: number
}

export const toneMappingArgTypes: ArgTypes<ToneMappingArgTypes> = {
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
