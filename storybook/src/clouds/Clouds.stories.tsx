import { type Meta } from '@storybook/react'

import _Basic from './Clouds-Basic'
import _Layers from './Clouds-Layers'
import _MovingEllipsoid from './Clouds-MovingEllipsoid'
import _QualityPresets from './Clouds-QualityPresets'

export default {
  title: 'clouds (WIP)/Clouds',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export const Basic = _Basic
export const QualityPresets = _QualityPresets
export const Layers = _Layers
export const MovingEllipsoid = _MovingEllipsoid
