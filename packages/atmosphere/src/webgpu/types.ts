import type { ShaderNodeObject } from 'three/tsl'
import type { Node, Texture3DNode, TextureNode } from 'three/webgpu'

// These types only provide for annotations, and not guarantee the type safety.
// I'm working on storing the dimensions in the types, but most of TSL functions
// are not generic and don't preserve the types anyways.

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
