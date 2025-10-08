// These types only provide for annotations, and not guarantee the type safety.
// I'm working on storing the dimensions in the types, but most of TSL functions
// are not generic and don't preserve the types anyways.

export const Length = 'float'
export const Wavelength = 'float'
export const Angle = 'float'
export const SolidAngle = 'float'
export const Power = 'float'
export const LuminousPower = 'float'

export const Dimensionless = 'float'
export const InverseLength = 'float'
export const Area = 'float'
export const Volume = 'float'
export const NumberDensity = 'float'
export const Irradiance = 'float'
export const Radiance = 'float'
export const SpectralPower = 'float'
export const SpectralIrradiance = 'float'
export const SpectralRadiance = 'float'
export const SpectralRadianceDensity = 'float'
export const ScatteringCoefficient = 'float'
export const InverseSolidAngle = 'float'
export const LuminousIntensity = 'float'
export const Luminance = 'float'
export const Illuminance = 'float'

export const AbstractSpectrum = 'vec3'
export const DimensionlessSpectrum = 'vec3'
export const PowerSpectrum = 'vec3'
export const IrradianceSpectrum = 'vec3'
export const RadianceSpectrum = 'vec3'
export const RadianceDensitySpectrum = 'vec3'
export const ScatteringSpectrum = 'vec3'

export const Position = 'vec3'
export const Direction = 'vec3'
export const Luminance3 = 'vec3'
export const Illuminance3 = 'vec3'

export const TransmittanceTexture = 'texture'
export const AbstractScatteringTexture = 'texture3D'
export const ReducedScatteringTexture = 'texture3D'
export const ScatteringTexture = 'texture3D'
export const ScatteringDensityTexture = 'texture3D'
export const IrradianceTexture = 'texture'

export type Length = typeof Length
export type Wavelength = typeof Wavelength
export type Angle = typeof Angle
export type SolidAngle = typeof SolidAngle
export type Power = typeof Power
export type LuminousPower = typeof LuminousPower

export type Dimensionless = typeof Dimensionless
export type InverseLength = typeof InverseLength
export type Area = typeof Area
export type Volume = typeof Volume
export type NumberDensity = typeof NumberDensity
export type Irradiance = typeof Irradiance
export type Radiance = typeof Radiance
export type SpectralPower = typeof SpectralPower
export type SpectralIrradiance = typeof SpectralIrradiance
export type SpectralRadiance = typeof SpectralRadiance
export type SpectralRadianceDensity = typeof SpectralRadianceDensity
export type ScatteringCoefficient = typeof ScatteringCoefficient
export type InverseSolidAngle = typeof InverseSolidAngle
export type LuminousIntensity = typeof LuminousIntensity
export type Luminance = typeof Luminance
export type Illuminance = typeof Illuminance

export type AbstractSpectrum = typeof AbstractSpectrum
export type DimensionlessSpectrum = typeof DimensionlessSpectrum
export type PowerSpectrum = typeof PowerSpectrum
export type IrradianceSpectrum = typeof IrradianceSpectrum
export type RadianceSpectrum = typeof RadianceSpectrum
export type RadianceDensitySpectrum = typeof RadianceDensitySpectrum
export type ScatteringSpectrum = typeof ScatteringSpectrum

export type Position = typeof Position
export type Direction = typeof Direction
export type Luminance3 = typeof Luminance3
export type Illuminance3 = typeof Illuminance3

export type TransmittanceTexture = typeof TransmittanceTexture
export type AbstractScatteringTexture = typeof AbstractScatteringTexture
export type ReducedScatteringTexture = typeof ReducedScatteringTexture
export type ScatteringTexture = typeof ScatteringTexture
export type ScatteringDensityTexture = typeof ScatteringDensityTexture
export type IrradianceTexture = typeof IrradianceTexture
