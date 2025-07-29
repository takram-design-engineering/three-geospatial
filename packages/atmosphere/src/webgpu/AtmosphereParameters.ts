import { Color, Vector2, Vector3 } from 'three'

import { assertType, radians } from '@takram/three-geospatial'
import {
  referenceTo,
  uniformType,
  type Node
} from '@takram/three-geospatial/webgpu'

function createUniformProxy<
  T extends {},
  U extends {},
  R = Omit<T, keyof U> & U
>(target: T, uniforms: U): R {
  return new Proxy(target, {
    get: (target, propertyName) => {
      assertType<keyof T & keyof U>(propertyName)
      return uniforms[propertyName] ?? target[propertyName]
    }
  }) as unknown as R
}

export class DensityProfileLayer {
  @uniformType('float') width: number
  @uniformType('float') expTerm: number
  @uniformType('float') expScale: number
  @uniformType('float') linearTerm: number
  @uniformType('float') constantTerm: number

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
  private createUniform(worldToUnit: Node<number>) {
    const reference = referenceTo(this)
    return createUniformProxy(this, {
      width: reference('width').mul(worldToUnit),
      expTerm: reference('expTerm'),
      expScale: reference('expScale'),
      linearTerm: reference('linearTerm'),
      constantTerm: reference('constantTerm')
    })
  }

  private uniforms?: UniformDensityProfileLayer

  getUniform(worldToUnit: Node<number>): UniformDensityProfileLayer {
    return (this.uniforms ??= this.createUniform(worldToUnit))
  }
}

export type UniformDensityProfileLayer = ReturnType<
  DensityProfileLayer['createUniform']
>

export class DensityProfile {
  layers: [DensityProfileLayer, DensityProfileLayer]

  constructor(layers: [DensityProfileLayer, DensityProfileLayer]) {
    this.layers = layers
  }

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  private createUniform(worldToUnit: Node<number>) {
    return createUniformProxy(this, {
      layers: [
        this.layers[0].getUniform(worldToUnit),
        this.layers[1].getUniform(worldToUnit)
      ] as const
    })
  }

  private uniforms?: UniformDensityProfile

  getUniform(worldToUnit: Node<number>): UniformDensityProfile {
    return (this.uniforms ??= this.createUniform(worldToUnit))
  }
}

export type UniformDensityProfile = ReturnType<DensityProfile['createUniform']>

const luminanceCoefficients = /*#__PURE__*/ new Vector3(0.2126, 0.7152, 0.0722)

export class AtmosphereParameters {
  @uniformType('float')
  worldToUnit = 0.001

  // The solar irradiance at the top of the atmosphere.
  @uniformType('vec3')
  solarIrradiance = new Vector3(1.474, 1.8504, 1.91198)

  // The sun's angular radius. Warning: the implementation uses approximations
  // that are valid only if this angle is smaller than 0.1 radians.
  @uniformType('float')
  sunAngularRadius = 0.004675

  // The distance between the planet center and the bottom of the atmosphere in
  // meters.
  @uniformType('float')
  bottomRadius = 6360000

  // The distance between the planet center and the top of the atmosphere in
  // meters.
  @uniformType('float')
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
  @uniformType('vec3')
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
  @uniformType('vec3')
  mieScattering = new Vector3(0.003996, 0.003996, 0.003996)

  // The extinction coefficient of aerosols at the altitude where their density
  // is maximum (usually the bottom of the atmosphere), as a function of
  // wavelength. The extinction coefficient at altitude h is equal to
  // "mieExtinction" times "mieDensity" at this altitude.
  @uniformType('vec3')
  mieExtinction = new Vector3(0.00444, 0.00444, 0.00444)

  // The asymmetry parameter for the Cornette-Shanks phase function for the
  // aerosols.
  @uniformType('float')
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
  @uniformType('vec3')
  absorptionExtinction = new Vector3(0.00065, 0.001881, 0.000085)

  // The average albedo of the ground.
  @uniformType('color')
  groundAlbedo = new Color().setScalar(0.1)

  // The cosine of the maximum Sun zenith angle for which atmospheric scattering
  // must be precomputed (for maximum precision, use the smallest Sun zenith
  // angle yielding negligible sky light radiance values. For instance, for the
  // Earth case, 102 degrees is a good choice - yielding muSMin = -0.2).
  @uniformType('float')
  minCosSun = Math.cos(radians(102))

  @uniformType('vec3')
  sunRadianceToLuminance = new Vector3(98242.786222, 69954.398112, 66475.012354)

  @uniformType('vec3')
  skyRadianceToLuminance = new Vector3(114974.91644, 71305.954816, 65310.548555)

  @uniformType('float')
  luminanceScale = 1 / luminanceCoefficients.dot(this.sunRadianceToLuminance)

  // Static options
  transmittancePrecisionLog = false
  combinedScatteringTextures = true
  higherOrderScatteringTexture = true
  constrainCameraAboveGround = false
  hideGround = false

  // Constants
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

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  private createUniform() {
    const reference = referenceTo(this)
    const worldToUnit = reference('worldToUnit')
    return createUniformProxy(this, {
      worldToUnit,
      solarIrradiance: reference('solarIrradiance'),
      sunAngularRadius: reference('sunAngularRadius'),
      bottomRadius: reference('bottomRadius').mul(worldToUnit),
      topRadius: reference('topRadius').mul(worldToUnit),
      rayleighDensity: this.rayleighDensity.getUniform(worldToUnit),
      rayleighScattering: reference('rayleighScattering'),
      mieDensity: this.mieDensity.getUniform(worldToUnit),
      mieScattering: reference('mieScattering'),
      mieExtinction: reference('mieExtinction'),
      miePhaseFunctionG: reference('miePhaseFunctionG'),
      absorptionDensity: this.absorptionDensity.getUniform(worldToUnit),
      absorptionExtinction: reference('absorptionExtinction'),
      groundAlbedo: reference('groundAlbedo'),
      minCosSun: reference('minCosSun'),
      sunRadianceToLuminance: reference('sunRadianceToLuminance'),
      skyRadianceToLuminance: reference('skyRadianceToLuminance'),
      luminanceScale: reference('luminanceScale')
    })
  }

  private uniforms?: UniformAtmosphereParameters

  getUniform(): UniformAtmosphereParameters {
    return (this.uniforms ??= this.createUniform())
  }
}

export type UniformAtmosphereParameters = ReturnType<
  AtmosphereParameters['createUniform']
>
