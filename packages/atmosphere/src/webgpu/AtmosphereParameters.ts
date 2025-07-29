import { Color, Vector2, Vector3 } from 'three'
import { reference, type ShaderNodeObject } from 'three/tsl'

import { radians } from '@takram/three-geospatial'
import type { Node, NodeValue } from '@takram/three-geospatial/webgpu'

type Uniform<T> = T extends NodeValue
  ? ShaderNodeObject<Node>
  : 'getUniform' extends keyof T
    ? T['getUniform'] extends (...args: any[]) => infer R
      ? R
      : never
    : never

type Uniforms<T, Exclude = never> = {
  [K in keyof T as Uniform<T[K]> extends never ? never : K]: K extends Exclude
    ? T[K]
    : Uniform<T[K]>
}

const luminanceCoefficients = /*#__PURE__*/ new Vector3(0.2126, 0.7152, 0.0722)

export type UniformDensityProfileLayer = Uniforms<DensityProfileLayer>

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

  private uniforms?: UniformDensityProfileLayer

  getUniform(worldToUnit: Node<number>): UniformDensityProfileLayer {
    return (this.uniforms ??= {
      width: reference('width', 'float', this).mul(worldToUnit),
      expTerm: reference('expTerm', 'float', this),
      expScale: reference('expScale', 'float', this),
      linearTerm: reference('linearTerm', 'float', this),
      constantTerm: reference('constantTerm', 'float', this)
    })
  }
}

export interface UniformDensityProfile {
  layers: [UniformDensityProfileLayer, UniformDensityProfileLayer]
}

export class DensityProfile {
  layers: [DensityProfileLayer, DensityProfileLayer]

  constructor(layers: [DensityProfileLayer, DensityProfileLayer]) {
    this.layers = layers
  }

  private uniforms?: UniformDensityProfile

  getUniform(worldToUnit: Node<number>): UniformDensityProfile {
    const [layer0, layer1] = this.layers
    return (this.uniforms ??= {
      layers: [layer0.getUniform(worldToUnit), layer1.getUniform(worldToUnit)]
    })
  }
}

interface Options {
  transmittancePrecisionLog: boolean
  combinedScatteringTextures: boolean
  higherOrderScatteringTexture: boolean
  constrainCameraAboveGround: boolean
  hideGround: boolean
}

export type UniformAtmosphereParameters = Uniforms<
  AtmosphereParameters,
  | 'transmittanceTextureSize'
  | 'irradianceTextureSize'
  | 'scatteringTextureRadiusSize'
  | 'scatteringTextureCosViewSize'
  | 'scatteringTextureCosSunSize'
  | 'scatteringTextureCosViewSunSize'
  | 'scatteringTextureSize'
> & {
  options: Options
}

export class AtmosphereParameters {
  worldToUnit = 0.001

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
  rayleighDensity = new DensityProfile([
    new DensityProfileLayer(0, 0, 0, 0, 0),
    new DensityProfileLayer(0, 1, -1 / 8, 0, 0)
  ])

  // The scattering coefficient of air molecules at the altitude where their
  // density is maximum (usually the bottom of the atmosphere), as a function of
  // wavelength. The scattering coefficient at altitude h is equal to
  // "rayleighScattering" times "rayleighDensity" at this altitude.
  rayleighScattering = new Vector3(0.005802, 0.013558, 0.0331)

  // The density profile of aerosols, i.e. a function from altitude to
  // dimensionless values between 0 (null density) and 1 (maximum density).
  mieDensity = new DensityProfile([
    new DensityProfileLayer(0, 0, 0, 0, 0),
    new DensityProfileLayer(0, 1, -1 / 1.2, 0, 0)
  ])

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
  absorptionDensity = new DensityProfile([
    new DensityProfileLayer(25000, 0, 0, 1 / 15, -2 / 3),
    new DensityProfileLayer(0, 0, 0, -1 / 15, 8 / 3)
  ])

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
  minCosSun = Math.cos(radians(120))

  sunRadianceToLuminance = new Vector3(98242.786222, 69954.398112, 66475.012354)
  skyRadianceToLuminance = new Vector3(114974.91644, 71305.954816, 65310.548555)
  luminanceScale = 1 / luminanceCoefficients.dot(this.sunRadianceToLuminance)

  options = {
    transmittancePrecisionLog: false,
    combinedScatteringTextures: true,
    higherOrderScatteringTexture: true,
    constrainCameraAboveGround: false,
    hideGround: false
  }

  transmittanceTextureSize = new Vector2(256, 64)
  irradianceTextureSize = new Vector2(64, 16)
  scatteringTextureRadiusSize = 32
  scatteringTextureCosViewSize = 128
  scatteringTextureCosSunSize = 32
  scatteringTextureCosViewSunSize = 8
  scatteringTextureSize = new Vector3(
    this.scatteringTextureCosViewSunSize * this.scatteringTextureCosSunSize,
    this.scatteringTextureCosViewSize,
    this.scatteringTextureRadiusSize
  )

  private uniforms?: UniformAtmosphereParameters

  getUniform(): UniformAtmosphereParameters {
    const worldToUnit = reference('worldToUnit', 'float', this)
    // prettier-ignore
    return (this.uniforms ??= ({
      worldToUnit,
      solarIrradiance: reference('solarIrradiance', 'vec3', this),
      sunAngularRadius: reference('sunAngularRadius', 'float', this),
      bottomRadius: reference('bottomRadius', 'float', this).mul(worldToUnit),
      topRadius: reference('topRadius', 'float', this).mul(worldToUnit),
      rayleighDensity: this.rayleighDensity.getUniform(worldToUnit),
      rayleighScattering: reference('rayleighScattering', 'vec3', this),
      mieDensity: this.mieDensity.getUniform(worldToUnit),
      mieScattering: reference('mieScattering', 'vec3', this),
      mieExtinction: reference('mieExtinction', 'vec3', this),
      miePhaseFunctionG: reference('miePhaseFunctionG', 'float', this),
      absorptionDensity: this.absorptionDensity.getUniform(worldToUnit),
      absorptionExtinction: reference('absorptionExtinction', 'vec3', this),
      groundAlbedo: reference('groundAlbedo', 'color', this),
      minCosSun: reference('minCosSun', 'float', this),
      sunRadianceToLuminance: reference('sunRadianceToLuminance', 'vec3', this),
      skyRadianceToLuminance: reference('skyRadianceToLuminance', 'vec3', this),
      luminanceScale: reference('luminanceScale', 'float', this),
      transmittanceTextureSize: this.transmittanceTextureSize,
      irradianceTextureSize: this.irradianceTextureSize,
      scatteringTextureRadiusSize: this.scatteringTextureRadiusSize,
      scatteringTextureCosViewSize: this.scatteringTextureCosViewSize,
      scatteringTextureCosSunSize: this.scatteringTextureCosSunSize,
      scatteringTextureCosViewSunSize: this.scatteringTextureCosViewSunSize,
      scatteringTextureSize: this.scatteringTextureSize,
      options: this.options,
    }))
  }
}
