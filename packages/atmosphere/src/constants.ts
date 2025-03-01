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

const ref = '82e00c5222d6cbc222af69abdf6d3f4fc9f63030'
export const DEFAULT_PRECOMPUTED_TEXTURES_URL = `https://media.githubusercontent.com/media/takram-design-engineering/three-geospatial/${ref}/packages/atmosphere/assets`
export const DEFAULT_STARS_DATA_URL = `https://media.githubusercontent.com/media/takram-design-engineering/three-geospatial/${ref}/packages/atmosphere/assets/stars.bin`
