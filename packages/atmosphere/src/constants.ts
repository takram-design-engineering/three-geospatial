import { Matrix3 } from 'three'

// Reference to the latest assets.
const ref = '9c6dfd0054f077f3ad4695b802e74d4c6a814440'
export const DEFAULT_PRECOMPUTED_TEXTURES_URL = `https://media.githubusercontent.com/media/takram-design-engineering/three-geospatial/${ref}/packages/atmosphere/assets`
export const DEFAULT_STARS_DATA_URL = `https://media.githubusercontent.com/media/takram-design-engineering/three-geospatial/${ref}/packages/atmosphere/assets/stars.bin`

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

export const METER_TO_LENGTH_UNIT = 1 / 1000
export const SKY_RENDER_ORDER = 100

// Reference: https://en.wikipedia.org/wiki/SRGB
// prettier-ignore
export const XYZ_TO_SRGB = /*#__PURE__*/ new Matrix3(
  3.2406255, -1.5372080, -0.4986286,
  -0.9689307, 1.8757561, 0.0415175,
  0.0557101, -0.2040211, 1.0569959
)
