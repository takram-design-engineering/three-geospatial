import { Vector2, Vector3 } from 'three'
import { uniformGroup } from 'three/tsl'

import { radians } from '@takram/three-geospatial'
import { nodeType, referenceTo } from '@takram/three-geospatial/webgpu'

import {
  Angle,
  Dimensionless,
  DimensionlessSpectrum,
  InverseLength,
  IrradianceSpectrum,
  Length,
  ScatteringSpectrum
} from './dimensional'

const groupNode = /*#__PURE__*/ uniformGroup('atmosphereParameters')

export class DensityProfileLayer {
  @nodeType(Length) width: number
  @nodeType(Dimensionless) expTerm: number
  @nodeType(InverseLength) expScale: number
  @nodeType(InverseLength) linearTerm: number
  @nodeType(Dimensionless) constantTerm: number

  constructor(
    width = 0,
    expTerm = 0,
    expScale = 0,
    linearTerm = 0,
    constantTerm = 0
  ) {
    this.width = width
    this.expTerm = expTerm
    this.expScale = expScale
    this.linearTerm = linearTerm
    this.constantTerm = constantTerm
  }

  private nodes?: DensityProfileLayerNodes

  getNodes(
    owner: AtmosphereParameters,
    prefix: string
  ): DensityProfileLayerNodes {
    return (this.nodes ??= this.createNodes(owner, prefix))
  }

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  createNodes(owner: AtmosphereParameters, prefix: string) {
    const reference = referenceTo<DensityProfileLayer>(this, {
      group: groupNode,
      withName: true,
      prefix: `${prefix}_`
    })
    return {
      width: reference('width', value => value * owner.worldToUnit),
      expTerm: reference('expTerm'),
      expScale: reference('expScale', value => value / owner.worldToUnit),
      linearTerm: reference('linearTerm', value => value / owner.worldToUnit),
      constantTerm: reference('constantTerm')
    }
  }

  // eslint-disable-next-line accessor-pairs, @typescript-eslint/class-methods-use-this
  set needsUpdate(value: boolean) {
    groupNode.needsUpdate = value
  }

  copy(other: DensityProfileLayer): this {
    this.width = other.width
    this.expTerm = other.expTerm
    this.expScale = other.expScale
    this.linearTerm = other.linearTerm
    this.constantTerm = other.constantTerm
    return this
  }

  clone(): DensityProfileLayer {
    return new DensityProfileLayer().copy(this)
  }
}

export type DensityProfileLayerNodes = ReturnType<
  DensityProfileLayer['createNodes']
>

export class DensityProfile {
  layers: [DensityProfileLayer, DensityProfileLayer]

  constructor(layers: [DensityProfileLayer, DensityProfileLayer]) {
    this.layers = layers
  }

  private nodes?: DensityProfileNodes

  getNodes(owner: AtmosphereParameters, prefix: string): DensityProfileNodes {
    return (this.nodes ??= this.createNodes(owner, prefix))
  }

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  createNodes(owner: AtmosphereParameters, prefix: string) {
    return {
      layers: [
        this.layers[0].getNodes(owner, `${prefix}_0`),
        this.layers[1].getNodes(owner, `${prefix}_1`)
      ] as const
    }
  }

  // eslint-disable-next-line accessor-pairs, @typescript-eslint/class-methods-use-this
  set needsUpdate(value: boolean) {
    groupNode.needsUpdate = value
  }

  copy(other: DensityProfile): this {
    this.layers = [other.layers[0].clone(), other.layers[1].clone()]
    return this
  }

  clone(): DensityProfile {
    return new DensityProfile([this.layers[0].clone(), this.layers[1].clone()])
  }
}

export type DensityProfileNodes = ReturnType<DensityProfile['createNodes']>

const luminanceCoefficients = /*#__PURE__*/ new Vector3(0.2126, 0.7152, 0.0722)

export class AtmosphereParameters {
  @nodeType(Dimensionless)
  worldToUnit = 0.001

  // The solar irradiance at the top of the atmosphere.
  @nodeType(IrradianceSpectrum)
  solarIrradiance = new Vector3(1.474, 1.8504, 1.91198)

  // The sun's angular radius.
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
    new DensityProfileLayer(),
    new DensityProfileLayer(0, 1, -1 / 8000)
  ])

  // The scattering coefficient of air molecules at the altitude where their
  // density is maximum.
  @nodeType(ScatteringSpectrum)
  rayleighScattering = new Vector3(0.000005802, 0.000013558, 0.0000331)

  // The density profile of aerosols.
  mieDensity = new DensityProfile([
    new DensityProfileLayer(),
    new DensityProfileLayer(0, 1, -1 / 1200)
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
  // https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html
  @nodeType(DimensionlessSpectrum)
  groundAlbedo = new Vector3().setScalar(0.3)

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

  private nodes?: AtmosphereParametersNodes

  getNodes(): AtmosphereParametersNodes {
    return (this.nodes ??= this.createNodes())
  }

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  private createNodes() {
    const reference = referenceTo<AtmosphereParameters>(this, {
      group: groupNode,
      withName: true
    })
    return {
      worldToUnit: reference('worldToUnit'),
      solarIrradiance: reference('solarIrradiance'),
      sunAngularRadius: reference('sunAngularRadius'),
      bottomRadius: reference(
        'bottomRadius',
        value => value * this.worldToUnit
      ),
      topRadius: reference('topRadius', value => value * this.worldToUnit),
      rayleighDensity: this.rayleighDensity.getNodes(this, 'rayleighDensity'),
      rayleighScattering: reference('rayleighScattering', value =>
        value.divideScalar(this.worldToUnit)
      ),
      mieDensity: this.mieDensity.getNodes(this, 'mieDensity'),
      mieScattering: reference('mieScattering', value =>
        value.divideScalar(this.worldToUnit)
      ),
      mieExtinction: reference('mieExtinction', value =>
        value.divideScalar(this.worldToUnit)
      ),
      miePhaseFunctionG: reference('miePhaseFunctionG'),
      absorptionDensity: this.absorptionDensity.getNodes(
        this,
        'absorptionDensity'
      ),
      absorptionExtinction: reference('absorptionExtinction', value =>
        value.divideScalar(this.worldToUnit)
      ),
      groundAlbedo: reference('groundAlbedo'),
      minCosSun: reference('minCosSun'),
      sunRadianceToLuminance: reference('sunRadianceToLuminance'),
      skyRadianceToLuminance: reference('skyRadianceToLuminance'),
      luminanceScale: reference('luminanceScale')
    }
  }

  // eslint-disable-next-line accessor-pairs, @typescript-eslint/class-methods-use-this
  set needsUpdate(value: boolean) {
    groupNode.needsUpdate = value
  }

  copy(other: AtmosphereParameters): this {
    this.worldToUnit = other.worldToUnit
    this.solarIrradiance.copy(other.solarIrradiance)
    this.sunAngularRadius = other.sunAngularRadius
    this.bottomRadius = other.bottomRadius
    this.topRadius = other.topRadius
    this.rayleighDensity.copy(other.rayleighDensity)
    this.rayleighScattering.copy(other.rayleighScattering)
    this.mieDensity.copy(other.mieDensity)
    this.mieScattering.copy(other.mieScattering)
    this.mieExtinction.copy(other.mieExtinction)
    this.miePhaseFunctionG = other.miePhaseFunctionG
    this.absorptionDensity.copy(other.absorptionDensity)
    this.absorptionExtinction.copy(other.absorptionExtinction)
    this.groundAlbedo.copy(other.groundAlbedo)
    this.minCosSun = other.minCosSun
    this.sunRadianceToLuminance.copy(other.sunRadianceToLuminance)
    this.skyRadianceToLuminance.copy(other.skyRadianceToLuminance)
    this.luminanceScale = other.luminanceScale
    this.transmittancePrecisionLog = other.transmittancePrecisionLog
    this.combinedScatteringTextures = other.combinedScatteringTextures
    this.higherOrderScatteringTexture = other.higherOrderScatteringTexture
    this.transmittanceTextureSize.copy(other.transmittanceTextureSize)
    this.irradianceTextureSize.copy(other.irradianceTextureSize)
    this.scatteringTextureRadiusSize = other.scatteringTextureRadiusSize
    this.scatteringTextureCosViewSize = other.scatteringTextureCosViewSize
    this.scatteringTextureCosSunSize = other.scatteringTextureCosSunSize
    this.scatteringTextureCosViewSunSize = other.scatteringTextureCosViewSunSize
    this.scatteringTextureSize.copy(other.scatteringTextureSize)
    return this
  }

  clone(): AtmosphereParameters {
    return new AtmosphereParameters().copy(this)
  }
}

export type AtmosphereParametersNodes = ReturnType<
  AtmosphereParameters['createNodes']
>
