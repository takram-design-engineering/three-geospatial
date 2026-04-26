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

import { reinterpretType } from '@takram/three-geospatial'

import { useSpringControl } from '../hooks/useSpringControl'
import { useTransientControl } from '../hooks/useTransientControl'

export interface ToneMappingArgs {
  toneMapping: boolean
  toneMappingMode: ToneMapping
  toneMappingExposure: number
}

export const toneMappingArgs = (
  defaults?: Partial<ToneMappingArgs>
): ToneMappingArgs => ({
  toneMapping: true,
  toneMappingMode: AgXToneMapping,
  toneMappingExposure: 1,
  ...defaults
})

export const toneMappingArgTypes = (
  options: {
    min?: number
    max?: number
  } = {}
): ArgTypes<ToneMappingArgs> => ({
  toneMapping: {
    name: 'enable',
    control: {
      type: 'boolean'
    },
    table: { category: 'tone mapping' }
  },
  toneMappingMode: {
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
      min: options.min ?? 0.1,
      max: options.max ?? 100,
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
    ({
      toneMapping: toneMappingEnabled,
      toneMappingMode: toneMapping
    }: ToneMappingArgs) => [toneMappingEnabled, toneMapping],
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

function useRenderPipelineToneMappingControls(
  toneMappingNode: ToneMappingNode,
  onChange?: (toneMapping: ToneMapping) => void
): void {
  const renderer = useThree<Renderer>(({ gl }) => gl as any)
  renderer.toneMapping = NoToneMapping

  const { exposureNode } = toneMappingNode
  invariant(exposureNode instanceof UniformNode)

  useTransientControl(
    ({
      toneMapping: toneMappingEnabled,
      toneMappingMode: toneMapping
    }: ToneMappingArgs) => [toneMappingEnabled, toneMapping],
    ([enabled, value]) => {
      // WORKAROUND: Missing method as of r182. Adding these in the module
      // augmentation breaks VSCode's auto completion.
      reinterpretType<
        ToneMappingNode & {
          setToneMapping: (value: ToneMapping) => void
        }
      >(toneMappingNode)
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
    useRenderPipelineToneMappingControls(arg1, arg2)
  } else {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useRendererToneMappingControls(arg1)
  }
}
