import { Vector2, Vector3 } from 'three'

import { assertType, radians } from '@takram/three-geospatial'
import { nodeType, propertyOf } from '@takram/three-geospatial/webgpu'

import {
  Angle,
  Dimensionless,
  DimensionlessSpectrum,
  InverseLength,
  IrradianceSpectrum,
  Length,
  ScatteringSpectrum
} from './dimensional'

function createContextProxy<
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
  getContext(worldToUnit: number) {
    const property = propertyOf<DensityProfileLayer>(this)
    return createContextProxy(this, {
      width: property('width', value => value * worldToUnit),
      expTerm: property('expTerm'),
      expScale: property('expScale', value => value / worldToUnit),
      linearTerm: property('linearTerm', value => value / worldToUnit),
      constantTerm: property('constantTerm')
    })
  }
}

export type DensityProfileLayerContext = ReturnType<
  DensityProfileLayer['getContext']
>

export class DensityProfile {
  layers: [DensityProfileLayer, DensityProfileLayer]

  constructor(layers: [DensityProfileLayer, DensityProfileLayer]) {
    this.layers = layers
  }

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  getContext(worldToUnit: number) {
    return createContextProxy(this, {
      layers: [
        this.layers[0].getContext(worldToUnit),
        this.layers[1].getContext(worldToUnit)
      ] as const
    })
  }
}

export type DensityProfileContext = ReturnType<DensityProfile['getContext']>

const luminanceCoefficients = /*#__PURE__*/ new Vector3(0.2126, 0.7152, 0.0722)

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

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  getContext() {
    const property = propertyOf<AtmosphereParameters>(this)
    return createContextProxy(this, {
      worldToUnit: property('worldToUnit'),
      solarIrradiance: property('solarIrradiance'),
      sunAngularRadius: property('sunAngularRadius'),
      bottomRadius: property('bottomRadius', value => value * this.worldToUnit),
      topRadius: property('topRadius', value => value * this.worldToUnit),
      rayleighDensity: this.rayleighDensity.getContext(this.worldToUnit),
      rayleighScattering: property('rayleighScattering', value =>
        value.divideScalar(this.worldToUnit)
      ),
      mieDensity: this.mieDensity.getContext(this.worldToUnit),
      mieScattering: property('mieScattering', value =>
        value.divideScalar(this.worldToUnit)
      ),
      mieExtinction: property('mieExtinction', value =>
        value.divideScalar(this.worldToUnit)
      ),
      miePhaseFunctionG: property('miePhaseFunctionG'),
      absorptionDensity: this.absorptionDensity.getContext(this.worldToUnit),
      absorptionExtinction: property('absorptionExtinction', value =>
        value.divideScalar(this.worldToUnit)
      ),
      groundAlbedo: property('groundAlbedo'),
      minCosSun: property('minCosSun'),
      sunRadianceToLuminance: property('sunRadianceToLuminance'),
      skyRadianceToLuminance: property('skyRadianceToLuminance'),
      luminanceScale: property('luminanceScale')
    })
  }
}

export type AtmosphereParametersContext = ReturnType<
  AtmosphereParameters['getContext']
>
