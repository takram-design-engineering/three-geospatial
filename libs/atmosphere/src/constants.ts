import { Vector3 } from 'three'

import { radians } from '@geovanni/core'

export const IRRADIANCE_TEXTURE_WIDTH = 64
export const IRRADIANCE_TEXTURE_HEIGHT = 16
export const SCATTERING_TEXTURE_R_SIZE = 32
export const SCATTERING_TEXTURE_MU_SIZE = 128
export const SCATTERING_TEXTURE_MU_S_SIZE = 32
export const SCATTERING_TEXTURE_NU_SIZE = 8
export const SCATTERING_TEXTURE_WIDTH =
  SCATTERING_TEXTURE_NU_SIZE * SCATTERING_TEXTURE_MU_S_SIZE
export const SCATTERING_TEXTURE_HEIGHT = SCATTERING_TEXTURE_MU_SIZE
export const SCATTERING_TEXTURE_DEPTH = SCATTERING_TEXTURE_R_SIZE
export const TRANSMITTANCE_TEXTURE_WIDTH = 256
export const TRANSMITTANCE_TEXTURE_HEIGHT = 64
export const METER_TO_UNIT_LENGTH = 1 / 1000

export const SKY_SPECTRAL_RADIANCE_TO_LUMINANCE = new Vector3(
  114974.916437,
  71305.954816,
  65310.548555
)
export const SUN_SPECTRAL_RADIANCE_TO_LUMINANCE = new Vector3(
  98242.786222,
  69954.398112,
  66475.012354
)

// We could store luminance (cd/m^2) in render buffers, but the illuminance
// values easily saturate, and switching between radiometric and photometric
// affects other parameters. Instead, we store the luminance values relative to
// the luminance of the sun.
const efficiency = /*#__PURE__*/ new Vector3(0.2126, 0.7152, 0.0722)
const luminance = efficiency.dot(SUN_SPECTRAL_RADIANCE_TO_LUMINANCE)
export const LUMINANCE_SCALE = 1 / luminance
SKY_SPECTRAL_RADIANCE_TO_LUMINANCE.multiplyScalar(LUMINANCE_SCALE)
SUN_SPECTRAL_RADIANCE_TO_LUMINANCE.multiplyScalar(LUMINANCE_SCALE)

export const ATMOSPHERE_PARAMETERS = {
  solarIrradiance: new Vector3(1.474, 1.8504, 1.91198),
  sunAngularRadius: 0.004675,
  bottomRadius: 6360000,
  topRadius: 6420000,
  rayleighScattering: new Vector3(0.005802, 0.013558, 0.0331),
  mieScattering: new Vector3(0.003996, 0.003996, 0.003996),
  miePhaseFunctionG: 0.8,
  // Use 120 for float and 102 for half-float.
  muSMinFloat: Math.cos(radians(120)),
  muSMinHalfFloat: Math.cos(radians(102))
}
