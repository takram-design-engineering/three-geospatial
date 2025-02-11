import { type Meta } from '@storybook/react'

import _Irradiance from './BuildingBlocks-Irradiance'
import _Scattering from './BuildingBlocks-Scattering'
import _Transmittance from './BuildingBlocks-Transmittance'

export default {
  title: 'atmosphere/Building Blocks',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export const Irradiance = _Irradiance
export const Scattering = _Scattering
export const Transmittance = _Transmittance
