import { useThree } from '@react-three/fiber'
import type { ArgTypes } from '@storybook/react-vite'
import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  CineonToneMapping,
  LinearToneMapping,
  NeutralToneMapping,
  NoToneMapping,
  ReinhardToneMapping,
  type ToneMapping
} from 'three'
import type { Renderer } from 'three/webgpu'

import { useSpringControl } from '../helpers/useSpringControl'
import { useTransientControl } from '../helpers/useTransientControl'

export interface ToneMappingArgs {
  toneMappingEnabled: boolean
  toneMapping: ToneMapping
  toneMappingExposure: number
}

export const toneMappingArgs: ToneMappingArgs = {
  toneMappingEnabled: true,
  toneMapping: AgXToneMapping,
  toneMappingExposure: 1
}

export const toneMappingArgTypes: ArgTypes<ToneMappingArgs> = {
  toneMappingEnabled: {
    name: 'enabled',
    control: {
      type: 'boolean'
    },
    table: { category: 'tone mapping' }
  },
  toneMapping: {
    name: 'mode',
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
  toneMappingExposure: {
    name: 'exposure',
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
    ({ toneMappingEnabled, toneMapping }: ToneMappingArgs) => [
      toneMappingEnabled,
      toneMapping
    ],
    ([enabled, value]) => {
      renderer.toneMapping = enabled ? value : NoToneMapping
      onChange?.(value)
    }
  )

  useSpringControl(
    ({ toneMappingExposure: exposure }: ToneMappingArgs) => exposure,
    value => {
      renderer.toneMappingExposure = value
    }
  )
}
