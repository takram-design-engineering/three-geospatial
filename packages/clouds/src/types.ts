export interface CloudLayer {
  altitude: number
  height: number
  extinctionCoefficient: number
  detailAmount: number
  weatherExponent: number
  coverageFilterWidth: number
  shadow?: boolean
}

export type CloudLayers = [CloudLayer, CloudLayer, CloudLayer, CloudLayer]
