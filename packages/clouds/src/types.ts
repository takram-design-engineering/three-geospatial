export interface CloudLayer {
  altitude: number
  height: number
  densityScale: number
  detailAmount: number
  weatherExponent: number
  shapeAlteringBias: number
  coverageFilterWidth: number
  shadow?: boolean
}

export type CloudLayers = [CloudLayer, CloudLayer, CloudLayer, CloudLayer]
