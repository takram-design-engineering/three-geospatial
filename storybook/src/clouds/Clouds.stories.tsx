import { type Meta } from '@storybook/react-vite'

import _Basic from './Clouds-Basic'
import _CustomLayers from './Clouds-CustomLayers'
import _MovingEllipsoid from './Clouds-MovingEllipsoid'
import _Vanilla from './Clouds-Vanilla'

export default {
  title: 'clouds/Clouds',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export const Basic = _Basic
export const CustomLayers = _CustomLayers
export const MovingEllipsoid = _MovingEllipsoid
export const Vanilla = _Vanilla
