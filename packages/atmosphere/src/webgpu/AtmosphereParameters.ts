import { Vector2, Vector3 } from 'three'

import { assertType, radians } from '@takram/three-geospatial'
import { Node, nodeType, referenceTo } from '@takram/three-geospatial/webgpu'

import {
  Angle,
  Dimensionless,
  DimensionlessSpectrum,
  InverseLength,
  IrradianceSpectrum,
  Length,
  ScatteringSpectrum
} from './types'

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
  @nodeType(Length) width: number
  @nodeType(Dimensionless) expTerm: number
  @nodeType(InverseLength) expScale: number
  @nodeType(InverseLength) linearTerm: number
  @nodeType(Dimensionless) constantTerm: number

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
  private createUniform(worldToUnit: Node<'float'>) {
    const reference = referenceTo(this)
    return createUniformProxy(this, {
      width: reference('width').mul(worldToUnit),
      expTerm: reference('expTerm'),
      expScale: reference('expScale').div(worldToUnit),
      linearTerm: reference('linearTerm').div(worldToUnit),
      constantTerm: reference('constantTerm')
    })
  }

  private _uniforms?: UniformDensityProfileLayer

  getUniform(worldToUnit: Node<'float'>): UniformDensityProfileLayer {
    return (this._uniforms ??= this.createUniform(worldToUnit))
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
  private createUniform(worldToUnit: Node<'float'>) {
    return createUniformProxy(this, {
      layers: [
        this.layers[0].getUniform(worldToUnit),
        this.layers[1].getUniform(worldToUnit)
      ] as const
    })
  }

  private _uniforms?: UniformDensityProfile

  getUniform(worldToUnit: Node<'float'>): UniformDensityProfile {
    return (this._uniforms ??= this.createUniform(worldToUnit))
  }
}

export type UniformDensityProfile = ReturnType<DensityProfile['createUniform']>

const luminanceCoefficients = /*#__PURE__*/ new Vector3(0.2126, 0.7152, 0.0722)

// TODO: Length is in meters but some coefficients seem too small for the
// mediump precision. Revisit if it causes any visual errors.
export class AtmosphereParameters {
  @nodeType(Dimensionless)
  worldToUnit = 0.001

  // The solar irradiance at the top of the atmosphere.
  @nodeType(IrradianceSpectrum)
  solarIrradiance = new Vector3(1.474, 1.8504, 1.91198)

  // The sun's angular radius in.
  @nodeType(Angle)
  sunAngularRadius = 0.004675

  // The distance between the planet center and the bottom of the atmosphere.
  @nodeType(Length)
  bottomRadius = 6360000

  // The distance between the planet center and the top of the atmosphere.
  @nodeType(Length)
  topRadius = 6420000

  // The density profile of air molecules.
  rayleighDensity = new DensityProfile([
    new DensityProfileLayer(0, 0, 0, 0, 0),
    new DensityProfileLayer(0, 1, -1 / 8000, 0, 0)
  ])

  // The scattering coefficient of air molecules at the altitude where their
  // density is maximum.
  @nodeType(ScatteringSpectrum)
  rayleighScattering = new Vector3(0.000005802, 0.000013558, 0.0000331)

  // The density profile of aerosols.
  mieDensity = new DensityProfile([
    new DensityProfileLayer(0, 0, 0, 0, 0),
    new DensityProfileLayer(0, 1, -1 / 1200, 0, 0)
  ])

  // The scattering coefficient of aerosols at the altitude where their density
  // is maximum.
  @nodeType(ScatteringSpectrum)
  mieScattering = new Vector3().setScalar(0.000003996)

  // The extinction coefficient of aerosols at the altitude where their density
  // is maximum.
  @nodeType(ScatteringSpectrum)
  mieExtinction = new Vector3().setScalar(0.00000444)

  // The anisotropy parameter for the Cornette-Shanks phase function.
  @nodeType(Dimensionless)
  miePhaseFunctionG = 0.8

  // The density profile of air molecules that absorb light (e.g. ozone).
  absorptionDensity = new DensityProfile([
    new DensityProfileLayer(25000, 0, 0, 1 / 15000, -2 / 3),
    new DensityProfileLayer(0, 0, 0, -1 / 15000, 8 / 3)
  ])

  // The extinction coefficient of molecules that absorb light (e.g. ozone) at
  // the altitude where their density is maximum.
  @nodeType(ScatteringSpectrum)
  absorptionExtinction = new Vector3(0.00000065, 0.000001881, 0.000000085)

  // The average albedo of the ground.
  @nodeType(DimensionlessSpectrum)
  groundAlbedo = new Vector3().setScalar(0.1)

  // The cosine of the maximum sun zenith angle for which atmospheric scattering
  // must be precomputed (for maximum precision, use the smallest Sun zenith
  // angle yielding negligible sky light radiance values.
  @nodeType(Dimensionless)
  minCosSun = Math.cos(radians(102))

  @nodeType(DimensionlessSpectrum)
  sunRadianceToLuminance = new Vector3(98242.786222, 69954.398112, 66475.012354)

  @nodeType(DimensionlessSpectrum)
  skyRadianceToLuminance = new Vector3(114974.91644, 71305.954816, 65310.548555)

  @nodeType(Dimensionless)
  luminanceScale = 1 / luminanceCoefficients.dot(this.sunRadianceToLuminance)

  // Whether to store the optical depth instead of the transmittance in the
  // transmittance textures. Linear filtering on logarithmic numbers yields
  // non-linear interpolations so that sampling will be performed manually, thus
  // this should be enabled only in the precomputation stage.
  transmittancePrecisionLog = false

  // Whether to store the single Mie scattering in the alpha channel of the
  // scattering texture, reducing the memory footprint on the GPU.
  combinedScatteringTextures = true

  // Whether to generate and use a separate texture for higher-order scattering
  // (n >= 2) for a better approximation of the multi-scattering occlusion.
  higherOrderScatteringTexture = true

  // Whether to clamp the camera position at the bottom atmosphere boundary in
  // the rendering stage.
  constrainCameraAboveGround = false

  // Whether to hide the ground in the sky by extrapolating the scattering at
  // the horizon in the rendering stage.
  hideGround = false

  // Texture sizes:
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

  set(value: Partial<AtmosphereParameters>): this {
    return Object.assign(this, value)
  }

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  private createUniform() {
    const reference = referenceTo(this)
    const worldToUnit = reference('worldToUnit')
    // prettier-ignore
    return createUniformProxy(this, {
      worldToUnit,
      solarIrradiance: reference('solarIrradiance'),
      sunAngularRadius: reference('sunAngularRadius'),
      bottomRadius: reference('bottomRadius').mul(worldToUnit),
      topRadius: reference('topRadius').mul(worldToUnit),
      rayleighDensity: this.rayleighDensity.getUniform(worldToUnit),
      rayleighScattering: reference('rayleighScattering').div(worldToUnit),
      mieDensity: this.mieDensity.getUniform(worldToUnit),
      mieScattering: reference('mieScattering').div(worldToUnit),
      mieExtinction: reference('mieExtinction').div(worldToUnit),
      miePhaseFunctionG: reference('miePhaseFunctionG'),
      absorptionDensity: this.absorptionDensity.getUniform(worldToUnit),
      absorptionExtinction: reference('absorptionExtinction').div(worldToUnit),
      groundAlbedo: reference('groundAlbedo'),
      minCosSun: reference('minCosSun'),
      sunRadianceToLuminance: reference('sunRadianceToLuminance'),
      skyRadianceToLuminance: reference('skyRadianceToLuminance'),
      luminanceScale: reference('luminanceScale')
    })
  }

  private _uniforms?: UniformAtmosphereParameters

  getUniform(): UniformAtmosphereParameters {
    return (this._uniforms ??= this.createUniform())
  }
}

export type UniformAtmosphereParameters = ReturnType<
  AtmosphereParameters['createUniform']
>
