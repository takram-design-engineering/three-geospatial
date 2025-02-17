import { type RequiredDeep } from 'type-fest'

type WeatherChannel = 'r' | 'g' | 'b' | 'a'

export interface DensityProfile {
  expTerm?: number
  exponent?: number
  linearTerm?: number
  constantTerm?: number
}

export interface CloudLayer {
  altitude?: number
  height?: number
  densityScale?: number
  shapeAmount?: number
  shapeDetailAmount?: number
  weatherChannel?: WeatherChannel
  weatherExponent?: number
  shapeAlteringBias?: number
  coverageFilterWidth?: number
  densityProfile?: DensityProfile
  shadow?: boolean
}

export const defaultCloudLayer: RequiredDeep<CloudLayer> = {
  altitude: 0,
  height: 0,
  densityScale: 0.2,
  shapeAmount: 1,
  shapeDetailAmount: 1,
  weatherChannel: 'r',
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
