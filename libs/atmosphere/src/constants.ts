import { Vector3 } from 'three'

import { radians } from '@geovanni/math'

export const IRRADIANCE_TEXTURE_WIDTH = 64
export const IRRADIANCE_TEXTURE_HEIGHT = 16
export const SCATTERING_TEXTURE_WIDTH = 256
export const SCATTERING_TEXTURE_HEIGHT = 128
export const SCATTERING_TEXTURE_DEPTH = 32
export const TRANSMITTANCE_TEXTURE_WIDTH = 256
export const TRANSMITTANCE_TEXTURE_HEIGHT = 64
export const METER_TO_UNIT_LENGTH = 1 / 1000
export const ATMOSPHERE_BOTTOM_RADIUS = 6360000
export const ATMOSPHERE_TOP_RADIUS = 6420000

export const ATMOSPHERE_PARAMETERS = {
  solarIrradiance: new Vector3(1.474, 1.8504, 1.91198),
  sunAngularRadius: 0.004675,
  bottomRadius: ATMOSPHERE_BOTTOM_RADIUS * METER_TO_UNIT_LENGTH,
  topRadius: ATMOSPHERE_TOP_RADIUS * METER_TO_UNIT_LENGTH,
  rayleighScattering: new Vector3(0.005802, 0.013558, 0.0331),
  mieScattering: new Vector3(0.003996, 0.003996, 0.003996),
  miePhaseFunctionG: 0.8,
  muSMin: Math.cos(radians(102))
}
