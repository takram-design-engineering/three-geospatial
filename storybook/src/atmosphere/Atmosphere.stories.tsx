import { type Meta } from '@storybook/react-vite'

import _Basic from './Atmosphere-Basic'
import _IrradianceMask from './Atmosphere-IrradianceMask'
import _MovingEllipsoid from './Atmosphere-MovingEllipsoid'
import _Vanilla from './Atmosphere-Vanilla'

export default {
  title: 'atmosphere/Atmosphere',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export const Basic = _Basic
export const IrradianceMask = _IrradianceMask
export const MovingEllipsoid = _MovingEllipsoid
export const Vanilla = _Vanilla
