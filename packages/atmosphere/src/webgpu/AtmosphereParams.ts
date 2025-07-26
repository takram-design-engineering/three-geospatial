import { Color, Vector3 } from 'three'
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

export interface DensityProfile {
  layers: [DensityProfileLayer, DensityProfileLayer]
}

interface Options {
  transmittancePrecisionLog: boolean
  combinedScatteringTextures: boolean
  higherOrderScatteringTexture: boolean
  constrainCameraAboveGround: boolean
  hideGround: boolean
}

export class AtmosphereParams {
  solarIrradiance = uniform(new Vector3(1.474, 1.8504, 1.91198))
  sunAngularRadius = uniform(0.004675)
  bottomRadius = uniform(6360)
  topRadius = uniform(6420)
  rayleighDensity: DensityProfile = {
    layers: [
      new DensityProfileLayer(0, 0, 0, 0, 0),
      new DensityProfileLayer(0, 1, -0.125, 0, 0)
    ]
  }
  rayleighScattering = uniform(new Vector3(0.005802, 0.013558, 0.0331))
  mieDensity: DensityProfile = {
    layers: [
      new DensityProfileLayer(0, 0, 0, 0, 0),
      new DensityProfileLayer(0, 1, -0.833333, 0, 0)
    ]
  }
  mieScattering = uniform(new Vector3(0.003996, 0.003996, 0.003996))
  mieExtinction = uniform(new Vector3(0.00444, 0.00444, 0.00444))
  miePhaseFunctionG = uniform(0.8)
  absorptionDensity: DensityProfile = {
    layers: [
      new DensityProfileLayer(25, 0, 0, 1 / 15, -2 / 3),
      new DensityProfileLayer(0, 0, 0, -1 / 15, 8 / 3)
    ]
  }
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
}
