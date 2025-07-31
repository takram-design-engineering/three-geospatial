import { useThree } from '@react-three/fiber'
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
import type { Renderer } from 'three/webgpu'

import { useSpringControl } from '../helpers/useSpringControl'
import { useTransientControl } from '../helpers/useTransientControl'

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

export function useToneMappingControl(
  onChange?: (toneMapping: ToneMapping) => void
): void {
  const renderer = useThree<Renderer>(({ gl }) => gl as any)
  useTransientControl(
    ({ toneMapping }: ToneMappingArgTypes) => toneMapping,
    value => {
      renderer.toneMapping = value
      onChange?.(value)
    }
  )
  useSpringControl(
    ({ exposure }: ToneMappingArgTypes) => exposure,
    value => {
      renderer.toneMappingExposure = value
    }
  )
}
