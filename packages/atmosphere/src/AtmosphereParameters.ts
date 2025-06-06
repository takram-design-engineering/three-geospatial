import { Vector3 } from 'three'

import { radians } from '@takram/three-geospatial'

const paramKeys = [
  'solarIrradiance',
  'sunAngularRadius',
  'bottomRadius',
  'topRadius',
  'rayleighScattering',
  'mieScattering',
  'miePhaseFunctionG',
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

export class AtmosphereParameters {
  static readonly DEFAULT = /*#__PURE__*/ new AtmosphereParameters()

  solarIrradiance = new Vector3(1.474, 1.8504, 1.91198)
  sunAngularRadius = 0.004675
  bottomRadius = 6360000
  topRadius = 6420000
  rayleighScattering = new Vector3(0.005802, 0.013558, 0.0331)
  mieScattering = new Vector3(0.003996, 0.003996, 0.003996)
  miePhaseFunctionG = 0.8
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
    const luminance = this.luminousEfficiency.dot(this.skyRadianceToLuminance)
    this.skyRadianceToRelativeLuminance
      .copy(this.skyRadianceToLuminance)
      .divideScalar(luminance)
    this.sunRadianceToRelativeLuminance
      .copy(this.sunRadianceToLuminance)
      .divideScalar(luminance)
  }
}
