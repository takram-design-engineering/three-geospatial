import { type Meta } from '@storybook/react'

import _Basic from './Clouds-Basic'
import _MovingEllipsoid from './Clouds-MovingEllipsoid'

export default {
  title: 'clouds (WIP)/Clouds',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export const Basic = _Basic
export const MovingEllipsoid = _MovingEllipsoid
