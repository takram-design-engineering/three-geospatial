import type { Meta } from '@storybook/react-vite'

import _HigherOrderScattering from './BuildingBlocks-HigherOrderScattering'
import _Irradiance from './BuildingBlocks-Irradiance'
import _Scattering from './BuildingBlocks-Scattering'
import _SingleMieScattering from './BuildingBlocks-SingleMieScattering'
import _Transmittance from './BuildingBlocks-Transmittance'

export default {
  title: 'atmosphere/Building Blocks',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export const Transmittance = _Transmittance
export const Scattering = _Scattering
export const Irradiance = _Irradiance
export const SingleMieScattering = _SingleMieScattering
export const HigherOrderScattering = _HigherOrderScattering
