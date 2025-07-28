import type { Meta } from '@storybook/react-vite'

import _HigherOrderScattering from './AtmosphereLUT-HigherOrderScattering'
import _Irradiance from './AtmosphereLUT-Irradiance'
import _Scattering from './AtmosphereLUT-Scattering'
import _SingleMieScattering from './AtmosphereLUT-SingleMieScattering'
import _Transmittance from './AtmosphereLUT-Transmittance'

export default {
  title: 'atmosphere/WebGPU (Experimental)/Atmosphere LUT',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export const Transmittance = _Transmittance
export const Scattering = _Scattering
export const Irradiance = _Irradiance
export const SingleMieScattering = _SingleMieScattering
export const HigherOrderScattering = _HigherOrderScattering
