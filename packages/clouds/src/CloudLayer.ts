import { type RequiredDeep } from 'type-fest'

type WeatherChannel = 'r' | 'g' | 'b' | 'a'

export interface DensityProfile {
  expTerm?: number
  exponent?: number
  linearTerm?: number
  constantTerm?: number
}

export interface CloudLayer {
  channel?: WeatherChannel
  altitude?: number
  height?: number
  densityScale?: number
  shapeAmount?: number
  shapeDetailAmount?: number
  weatherExponent?: number
  shapeAlteringBias?: number
  coverageFilterWidth?: number
  densityProfile?: DensityProfile
  shadow?: boolean
}

export const defaultCloudLayer: RequiredDeep<CloudLayer> = {
  channel: 'r',
  altitude: 0,
  height: 0,
  densityScale: 0.2,
  shapeAmount: 1,
  shapeDetailAmount: 1,
  weatherExponent: 1,
  shapeAlteringBias: 0.35,
  coverageFilterWidth: 0.6,
  densityProfile: {
    expTerm: 0,
    exponent: 0,
    linearTerm: 0.75,
    constantTerm: 0.25
  },
  shadow: false
}

export function createDefaultCloudLayers(): CloudLayer[] {
  return [
    {
      channel: 'r',
      altitude: 750,
      height: 650,
      densityScale: 0.2,
      shapeAmount: 1,
      shapeDetailAmount: 1,
      weatherExponent: 1,
      shapeAlteringBias: 0.35,
      coverageFilterWidth: 0.6,
      shadow: true
    },
    {
      channel: 'g',
      altitude: 1000,
      height: 1200,
      densityScale: 0.2,
      shapeAmount: 1,
      shapeDetailAmount: 1,
      weatherExponent: 1,
      shapeAlteringBias: 0.35,
      coverageFilterWidth: 0.6,
      shadow: true
    },
    {
      channel: 'b',
      altitude: 7500,
      height: 500,
      densityScale: 0.003,
      shapeAmount: 0.4,
      shapeDetailAmount: 0,
      weatherExponent: 1,
      shapeAlteringBias: 0.35,
      coverageFilterWidth: 0.5
    },
    { channel: 'a' }
  ]
}
