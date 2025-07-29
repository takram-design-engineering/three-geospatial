import { Color, Uniform, Vector3 } from 'three'

import { radians } from '@takram/three-geospatial'

import { METER_TO_LENGTH_UNIT } from './constants'

const LUMINANCE_COEFFS = /*#__PURE__*/ new Vector3(0.2126, 0.7152, 0.0722)

const paramKeys = [
  'solarIrradiance',
  'sunAngularRadius',
  'bottomRadius',
  'topRadius',
  'rayleighDensity',
  'rayleighScattering',
  'mieDensity',
  'mieScattering',
  'mieExtinction',
  'miePhaseFunctionG',
  'absorptionDensity',
  'absorptionExtinction',
  'groundAlbedo',
  'muSMin',
  'skyRadianceToLuminance',
  'sunRadianceToLuminance'
] as const

export interface AtmosphereParametersOptions
  extends Partial<Pick<AtmosphereParameters, (typeof paramKeys)[number]>> {}

function applyOptions(
  target: AtmosphereParameters,
  params?: AtmosphereParametersOptions
): void {
  if (params == null) {
    return
  }
  for (const key of paramKeys) {
    const value = params[key]
    if (value == null) {
      continue
    }
    if (target[key] instanceof Vector3) {
      target[key].copy(value as Vector3)
    } else {
      ;(target as any)[key] = value
    }
  }
}

// An atmosphere layer of width 'width', and whose density is defined as:
//   expTerm * exp(expScale * h) + linearTerm * h + constantTerm
// clamped to [0, 1], and where h is the altitude.
export class DensityProfileLayer {
  width: number
  expTerm: number
  expScale: number
  linearTerm: number
  constantTerm: number

  constructor(
    width: number,
    expTerm: number,
    expScale: number,
    linearTerm: number,
    constantTerm: number
  ) {
    this.width = width
    this.expTerm = expTerm
    this.expScale = expScale
    this.linearTerm = linearTerm
    this.constantTerm = constantTerm
  }

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  toUniform() {
    return new Uniform({
      width: this.width,
      exp_term: this.expTerm,
      exp_scale: this.expScale,
      linear_term: this.linearTerm,
      constant_term: this.constantTerm
    })
  }
}

// An atmosphere density profile made of several layers on top of each other
// (from bottom to top). The width of the last layer is ignored, i.e. it always
// extend to the top atmosphere boundary. The profile values vary between 0
// (null density) to 1 (maximum density).
type DensityProfile = [DensityProfileLayer, DensityProfileLayer]

export class AtmosphereParameters {
  static readonly DEFAULT = /*#__PURE__*/ new AtmosphereParameters()

  // The solar irradiance at the top of the atmosphere.
  solarIrradiance = new Vector3(1.474, 1.8504, 1.91198)

  // The sun's angular radius. Warning: the implementation uses approximations
  // that are valid only if this angle is smaller than 0.1 radians.
  sunAngularRadius = 0.004675

  // The distance between the planet center and the bottom of the atmosphere in
  // meters.
  bottomRadius = 6360000

  // The distance between the planet center and the top of the atmosphere in
  // meters.
  topRadius = 6420000

  // The density profile of air molecules, i.e. a function from altitude to
  // dimensionless values between 0 (null density) and 1 (maximum density).
  // prettier-ignore
  rayleighDensity: DensityProfile = [
    new DensityProfileLayer(0, 0, 0, 0, 0),
    new DensityProfileLayer(0, 1, -0.125, 0, 0)
  ]

  // The scattering coefficient of air molecules at the altitude where their
  // density is maximum (usually the bottom of the atmosphere), as a function of
  // wavelength. The scattering coefficient at altitude h is equal to
  // "rayleighScattering" times "rayleighDensity" at this altitude.
  rayleighScattering = new Vector3(0.005802, 0.013558, 0.0331)

  // The density profile of aerosols, i.e. a function from altitude to
  // dimensionless values between 0 (null density) and 1 (maximum density).
  mieDensity: DensityProfile = [
    new DensityProfileLayer(0, 0, 0, 0, 0),
    new DensityProfileLayer(0, 1, -0.833333, 0, 0)
  ]

  // The scattering coefficient of aerosols at the altitude where their density
  // is maximum (usually the bottom of the atmosphere), as a function of
  // wavelength. The scattering coefficient at altitude h is equal to
  // "mieScattering" times "mieDensity" at this altitude.
  mieScattering = new Vector3(0.003996, 0.003996, 0.003996)

  // The extinction coefficient of aerosols at the altitude where their density
  // is maximum (usually the bottom of the atmosphere), as a function of
  // wavelength. The extinction coefficient at altitude h is equal to
  // "mieExtinction" times "mieDensity" at this altitude.
  mieExtinction = new Vector3(0.00444, 0.00444, 0.00444)

  // The asymmetry parameter for the Cornette-Shanks phase function for the
  // aerosols.
  miePhaseFunctionG = 0.8

  // The density profile of air molecules that absorb light (e.g. ozone), i.e.
  // a function from altitude to dimensionless values between 0 (null density)
  // and 1 (maximum density).
  absorptionDensity: DensityProfile = [
    new DensityProfileLayer(25, 0, 0, 1 / 15, -2 / 3),
    new DensityProfileLayer(0, 0, 0, -1 / 15, 8 / 3)
  ]

  // The extinction coefficient of molecules that absorb light (e.g. ozone) at
  // the altitude where their density is maximum, as a function of wavelength.
  // The extinction coefficient at altitude h is equal to
  // "absorptionExtinction" times "absorptionDensity" at this altitude.
  absorptionExtinction = new Vector3(0.00065, 0.001881, 0.000085)

  // The average albedo of the ground.
  groundAlbedo = new Color().setScalar(0.1)

  // The cosine of the maximum Sun zenith angle for which atmospheric scattering
  // must be precomputed (for maximum precision, use the smallest Sun zenith
  // angle yielding negligible sky light radiance values. For instance, for the
  // Earth case, 102 degrees is a good choice - yielding muSMin = -0.2).
  muSMin = Math.cos(radians(120))

  // Radiance to luminance conversion
  sunRadianceToLuminance = new Vector3(98242.786222, 69954.398112, 66475.012354)
  // prettier-ignore
  skyRadianceToLuminance = new Vector3(114974.916437, 71305.954816, 65310.548555)
  sunRadianceToRelativeLuminance = new Vector3()
  skyRadianceToRelativeLuminance = new Vector3()

  constructor(options?: AtmosphereParametersOptions) {
    applyOptions(this, options)

    // Luminance values are too large for storing in half precision buffer.
    // We divide them by the luminance of the sun with the unit radiance.
    const luminance = LUMINANCE_COEFFS.dot(this.sunRadianceToLuminance)
    this.sunRadianceToRelativeLuminance
      .copy(this.sunRadianceToLuminance)
      .divideScalar(luminance)
    this.skyRadianceToRelativeLuminance
      .copy(this.skyRadianceToLuminance)
      .divideScalar(luminance)
  }

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  toUniform() {
    return new Uniform({
      solar_irradiance: this.solarIrradiance,
      sun_angular_radius: this.sunAngularRadius,
      bottom_radius: this.bottomRadius * METER_TO_LENGTH_UNIT,
      top_radius: this.topRadius * METER_TO_LENGTH_UNIT,
      rayleigh_density: {
        layers: this.rayleighDensity.map(layer => layer.toUniform().value)
      },
      rayleigh_scattering: this.rayleighScattering,
      mie_density: {
        layers: this.mieDensity.map(layer => layer.toUniform().value)
      },
      mie_scattering: this.mieScattering,
      mie_extinction: this.mieExtinction,
      mie_phase_function_g: this.miePhaseFunctionG,
      absorption_density: {
        layers: this.absorptionDensity.map(layer => layer.toUniform().value)
      },
      absorption_extinction: this.absorptionExtinction,
      ground_albedo: this.groundAlbedo,
      mu_s_min: this.muSMin
    })
  }
}

export type AtmosphereParametersUniform = ReturnType<
  AtmosphereParameters['toUniform']
>
