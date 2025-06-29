import { Color, Vector3, type IUniform } from 'three'

import { radians } from '@takram/three-geospatial'

import { METER_TO_LENGTH_UNIT } from './constants'

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
  'sunRadianceToLuminance',
  'luminousEfficiency'
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
}

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
  rayleighDensity = [
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
  mieDensity = [
    new DensityProfileLayer(0, 0, 0, 0, 0.0),
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
  absorptionDensity = [
    new DensityProfileLayer(25, 0, 0, 0.066667, -0.666667),
    new DensityProfileLayer(0, 0, 0, -0.066667, 2.666667)
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
  // prettier-ignore
  skyRadianceToLuminance = new Vector3(114974.916437, 71305.954816, 65310.548555)
  sunRadianceToLuminance = new Vector3(98242.786222, 69954.398112, 66475.012354)
  luminousEfficiency = new Vector3(0.2126, 0.7152, 0.0722)
  skyRadianceToRelativeLuminance = new Vector3()
  sunRadianceToRelativeLuminance = new Vector3()

  constructor(options?: AtmosphereParametersOptions) {
    applyOptions(this, options)

    // We could store the raw luminance in the render buffer, but it easily
    // becomes saturated in precision.
    const luminance = this.luminousEfficiency.dot(this.sunRadianceToLuminance)
    this.skyRadianceToRelativeLuminance
      .copy(this.skyRadianceToLuminance)
      .divideScalar(luminance)
    this.sunRadianceToRelativeLuminance
      .copy(this.sunRadianceToLuminance)
      .divideScalar(luminance)
  }

  toStructuredUniform(): IUniform<object> {
    return {
      value: {
        solar_irradiance: this.solarIrradiance,
        sun_angular_radius: this.sunAngularRadius,
        bottom_radius: this.bottomRadius * METER_TO_LENGTH_UNIT,
        top_radius: this.topRadius * METER_TO_LENGTH_UNIT,
        rayleigh_density: {
          layers: this.rayleighDensity.map(layer => ({
            width: layer.width,
            exp_term: layer.expTerm,
            exp_scale: layer.expScale,
            linear_term: layer.linearTerm,
            constant_term: layer.constantTerm
          }))
        },
        rayleigh_scattering: this.rayleighScattering,
        mie_density: {
          layers: this.mieDensity.map(layer => ({
            width: layer.width,
            exp_term: layer.expTerm,
            exp_scale: layer.expScale,
            linear_term: layer.linearTerm,
            constant_term: layer.constantTerm
          }))
        },
        mie_scattering: this.mieScattering,
        mie_extinction: this.mieExtinction,
        mie_phase_function_g: this.miePhaseFunctionG,
        absorption_density: {
          layers: this.absorptionDensity.map(layer => ({
            width: layer.width,
            exp_term: layer.expTerm,
            exp_scale: layer.expScale,
            linear_term: layer.linearTerm,
            constant_term: layer.constantTerm
          }))
        },
        absorption_extinction: this.absorptionExtinction,
        ground_albedo: this.groundAlbedo,
        mu_s_min: this.muSMin
      }
    }
  }
}
