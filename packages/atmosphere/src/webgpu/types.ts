import type { Texture3DNode, TextureNode } from 'three/webgpu'

export type Length = 'float'
export type Wavelength = 'float'
export type Angle = 'float'
export type SolidAngle = 'float'
export type Power = 'float'
export type LuminousPower = 'float'

export type InverseLength = 'float'
export type Area = 'float'
export type Volume = 'float'
export type NumberDensity = 'float'
export type Irradiance = 'float'
export type Radiance = 'float'
export type SpectralPower = 'float'
export type SpectralIrradiance = 'float'
export type SpectralRadiance = 'float'
export type SpectralRadianceDensity = 'float'
export type ScatteringCoefficient = 'float'
export type InverseSolidAngle = 'float'
export type LuminousIntensity = 'float'
export type Luminance = 'float'
export type Illuminance = 'float'

export type AbstractSpectrum = 'vec3'
export type DimensionlessSpectrum = 'vec3'
export type PowerSpectrum = 'vec3'
export type IrradianceSpectrum = 'vec3'
export type RadianceSpectrum = 'vec3'
export type RadianceDensitySpectrum = 'vec3'
export type ScatteringSpectrum = 'vec3'

export type Position = 'vec3'
export type Direction = 'vec3'
export type Luminance3 = 'vec3'
export type Illuminance3 = 'vec3'

export type TransmittanceTextureNode = TextureNode
export type AbstractScatteringTextureNode = Texture3DNode
export type ReducedScatteringTextureNode = Texture3DNode
export type ScatteringTextureNode = Texture3DNode
export type ScatteringDensityTextureNode = Texture3DNode
export type IrradianceTextureNode = TextureNode
