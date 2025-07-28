import { Color, Vector2, Vector3 } from 'three'
import { uniform, type ShaderNodeObject } from 'three/tsl'
import type { UniformNode } from 'three/webgpu'

import { radians } from '@takram/three-geospatial'

export class DensityProfileLayer {
  width: ShaderNodeObject<UniformNode<number>>
  expTerm: ShaderNodeObject<UniformNode<number>>
  expScale: ShaderNodeObject<UniformNode<number>>
  linearTerm: ShaderNodeObject<UniformNode<number>>
  constantTerm: ShaderNodeObject<UniformNode<number>>

  constructor(
    width: number,
    expTerm: number,
    expScale: number,
    linearTerm: number,
    constantTerm: number
  ) {
    this.width = uniform(width)
    this.expTerm = uniform(expTerm)
    this.expScale = uniform(expScale)
    this.linearTerm = uniform(linearTerm)
    this.constantTerm = uniform(constantTerm)
  }
}

export class DensityProfile {
  layers: [DensityProfileLayer, DensityProfileLayer]

  constructor(layers: [DensityProfileLayer, DensityProfileLayer]) {
    this.layers = layers
  }
}

interface Options {
  transmittancePrecisionLog: boolean
  combinedScatteringTextures: boolean
  higherOrderScatteringTexture: boolean
  constrainCameraAboveGround: boolean
  hideGround: boolean
}

export class AtmosphereParameters {
  solarIrradiance = uniform(new Vector3(1.474, 1.8504, 1.91198))
  sunAngularRadius = uniform(0.004675)
  bottomRadius = uniform(6360)
  topRadius = uniform(6420)
  rayleighDensity = new DensityProfile([
    new DensityProfileLayer(0, 0, 0, 0, 0),
    new DensityProfileLayer(0, 1, -0.125, 0, 0)
  ])
  rayleighScattering = uniform(new Vector3(0.005802, 0.013558, 0.0331))
  mieDensity = new DensityProfile([
    new DensityProfileLayer(0, 0, 0, 0, 0),
    new DensityProfileLayer(0, 1, -0.833333, 0, 0)
  ])
  mieScattering = uniform(new Vector3(0.003996, 0.003996, 0.003996))
  mieExtinction = uniform(new Vector3(0.00444, 0.00444, 0.00444))
  miePhaseFunctionG = uniform(0.8)
  absorptionDensity = new DensityProfile([
    new DensityProfileLayer(25, 0, 0, 1 / 15, -2 / 3),
    new DensityProfileLayer(0, 0, 0, -1 / 15, 8 / 3)
  ])
  absorptionExtinction = uniform(new Vector3(0.00065, 0.001881, 0.000085))
  groundAlbedo = uniform(new Color().setScalar(0.1))
  minCosSun = uniform(Math.cos(radians(120)))

  sunRadianceToLuminance = uniform(new Vector3())
  skyRadianceToLuminance = uniform(new Vector3())

  options: Options = {
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

  constructor() {
    const sunRadianceToLuminance = new Vector3(
      98242.786222,
      69954.398112,
      66475.012354
    )
    const skyRadianceToLuminance = new Vector3(
      114974.916437,
      71305.954816,
      65310.548555
    )
    const luminance = new Vector3(0.2126, 0.7152, 0.0722).dot(
      sunRadianceToLuminance
    )
    this.sunRadianceToLuminance.value
      .copy(sunRadianceToLuminance)
      .divideScalar(luminance)
    this.skyRadianceToLuminance.value
      .copy(skyRadianceToLuminance)
      .divideScalar(luminance)
  }
}
