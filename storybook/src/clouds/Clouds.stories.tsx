import type { Meta } from '@storybook/react-vite'

import _Basic from './Clouds-Basic'
import _CustomLayers from './Clouds-CustomLayers'
import _Vanilla from './Clouds-Vanilla'
import _WorldOriginRebasing from './Clouds-WorldOriginRebasing'

export default {
  title: 'clouds/Clouds',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export const Basic = _Basic
export const CustomLayers = _CustomLayers
export const WorldOriginRebasing = _WorldOriginRebasing
export const Vanilla = _Vanilla
