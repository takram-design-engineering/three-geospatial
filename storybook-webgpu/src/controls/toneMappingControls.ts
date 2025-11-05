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
import { UniformNode, type Renderer, type ToneMappingNode } from 'three/webgpu'
import invariant from 'tiny-invariant'

import { useSpringControl } from '../hooks/useSpringControl'
import { useTransientControl } from '../hooks/useTransientControl'

export interface ToneMappingArgs {
  toneMappingEnabled: boolean
  toneMapping: ToneMapping
  toneMappingExposure: number
}

export const toneMappingArgs = (
  defaults?: Partial<ToneMappingArgs>
): ToneMappingArgs => ({
  toneMappingEnabled: true,
  toneMapping: AgXToneMapping,
  toneMappingExposure: 1,
  ...defaults
})

export const toneMappingArgTypes = (): ArgTypes<ToneMappingArgs> => ({
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
        [NeutralToneMapping]: 'Khronos PBR Neutral'
      }
    },
    table: { category: 'tone mapping' }
  },
  toneMappingExposure: {
    name: 'exposure',
    control: {
      type: 'range',
      min: 0.1,
      max: 100,
      step: 0.1
    },
    table: { category: 'tone mapping' }
  }
})

function useRendererToneMappingControls(
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

function usePostProcessingToneMappingControls(
  toneMappingNode: ToneMappingNode,
  onChange?: (toneMapping: ToneMapping) => void
): void {
  const renderer = useThree<Renderer>(({ gl }) => gl as any)
  renderer.toneMapping = NoToneMapping

  const { exposureNode } = toneMappingNode
  invariant(exposureNode instanceof UniformNode)

  useTransientControl(
    ({ toneMappingEnabled, toneMapping }: ToneMappingArgs) => [
      toneMappingEnabled,
      toneMapping
    ],
    ([enabled, value]) => {
      toneMappingNode.setToneMapping(enabled ? value : NoToneMapping)
      onChange?.(value)
    }
  )

  useSpringControl(
    ({ toneMappingExposure: exposure }: ToneMappingArgs) => exposure,
    value => {
      exposureNode.value = value
    }
  )
}

export function useToneMappingControls(
  toneMappingNode: ToneMappingNode,
  onChange?: (toneMapping: ToneMapping) => void
): void

export function useToneMappingControls(
  onChange?: (toneMapping: ToneMapping) => void
): void

export function useToneMappingControls(
  arg1?: ToneMappingNode | ((toneMapping: ToneMapping) => void),
  arg2?: (toneMapping: ToneMapping) => void
): void {
  if (arg1 != null && typeof arg1 !== 'function') {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    usePostProcessingToneMappingControls(arg1, arg2)
  } else {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useRendererToneMappingControls(arg1)
  }
}
