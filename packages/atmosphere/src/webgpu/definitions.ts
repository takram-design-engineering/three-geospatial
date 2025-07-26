import { uniform, type ShaderNodeObject } from 'three/tsl'
import {
  Color,
  Vector3,
  type Node,
  type Texture3DNode,
  type TextureNode,
  type UniformNode
} from 'three/webgpu'

import { radians } from '@takram/three-geospatial'

type N<T extends Node> = ShaderNodeObject<T>

export type Length<T extends Node = Node> = N<T>
export type Wavelength<T extends Node = Node> = N<T>
export type Angle<T extends Node = Node> = N<T>
export type SolidAngle<T extends Node = Node> = N<T>
export type Power<T extends Node = Node> = N<T>
export type LuminousPower<T extends Node = Node> = N<T>

export type InverseLength<T extends Node = Node> = N<T>
export type Area<T extends Node = Node> = N<T>
export type Volume<T extends Node = Node> = N<T>
export type NumberDensity<T extends Node = Node> = N<T>
export type Irradiance<T extends Node = Node> = N<T>
export type Radiance<T extends Node = Node> = N<T>
export type SpectralPower<T extends Node = Node> = N<T>
export type SpectralIrradiance<T extends Node = Node> = N<T>
export type SpectralRadiance<T extends Node = Node> = N<T>
export type SpectralRadianceDensity<T extends Node = Node> = N<T>
export type ScatteringCoefficient<T extends Node = Node> = N<T>
export type InverseSolidAngle<T extends Node = Node> = N<T>
export type LuminousIntensity<T extends Node = Node> = N<T>
export type Luminance<T extends Node = Node> = N<T>
export type Illuminance<T extends Node = Node> = N<T>

export type AbstractSpectrum<T extends Node = Node> = N<T>
export type DimensionlessSpectrum<T extends Node = Node> = N<T>
export type PowerSpectrum<T extends Node = Node> = N<T>
export type IrradianceSpectrum<T extends Node = Node> = N<T>
export type RadianceSpectrum<T extends Node = Node> = N<T>
export type RadianceDensitySpectrum<T extends Node = Node> = N<T>
export type ScatteringSpectrum<T extends Node = Node> = N<T>

export type Position<T extends Node = Node> = N<T>
export type Direction<T extends Node = Node> = N<T>
export type Luminance3<T extends Node = Node> = N<T>
export type Illuminance3<T extends Node = Node> = N<T>

export type TransmittanceTexture<T extends Node = TextureNode> = N<T>
export type AbstractScatteringTexture<T extends Node = Texture3DNode> = N<T>
export type ReducedScatteringTexture<T extends Node = Texture3DNode> = N<T>
export type ScatteringTexture<T extends Node = Texture3DNode> = N<T>
export type ScatteringDensityTexture<T extends Node = Texture3DNode> = N<T>
export type IrradianceTexture<T extends Node = TextureNode> = N<T>

export type Bool<T extends Node = Node> = N<T>
export type Int<T extends Node = Node> = N<T>
export type Float<T extends Node = Node> = N<T>
export type Vec2<T extends Node = Node> = N<T>
export type Vec3<T extends Node = Node> = N<T>
export type Vec4<T extends Node = Node> = N<T>

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

export interface Options {
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
