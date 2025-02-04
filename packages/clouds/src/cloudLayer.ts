export interface CloudLayer {
  altitude: number
  height: number
  densityScale: number
  shapeAmount: number
  detailAmount: number
  weatherExponent: number
  shapeAlteringBias: number
  coverageFilterWidth: number
  shadow?: boolean
}

export const defaultCloudLayer: CloudLayer = {
  altitude: 0,
  height: 0,
  densityScale: 0.15,
  shapeAmount: 1,
  detailAmount: 1,
  weatherExponent: 1,
  shapeAlteringBias: 0.35,
  coverageFilterWidth: 0.6
}
