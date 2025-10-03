import type { Meta } from '@storybook/react-vite'

import _Basic from './Atmosphere-Basic'
import _LightingMask from './Atmosphere-LightingMask'
import _Vanilla from './Atmosphere-Vanilla'
import _WorldOriginRebasing from './Atmosphere-WorldOriginRebasing'

export default {
  title: 'atmosphere/Atmosphere',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export const Basic = _Basic
export const LightingMask = _LightingMask
export const WorldOriginRebasing = _WorldOriginRebasing
export const Vanilla = _Vanilla
