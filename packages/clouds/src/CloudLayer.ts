import { DensityProfile, type DensityProfileLike } from './DensityProfile'

const paramKeys = [
  'channel',
  'altitude',
  'height',
  'densityScale',
  'shapeAmount',
  'shapeDetailAmount',
  'weatherExponent',
  'shapeAlteringBias',
  'coverageFilterWidth',
  'shadow',
  'densityProfile'
] as const

export interface CloudLayerLike
  extends Partial<
    Pick<CloudLayer, Exclude<(typeof paramKeys)[number], 'densityProfile'>>
  > {
  densityProfile?: DensityProfileLike
}

function applyOptions(target: CloudLayer, params?: CloudLayerLike): void {
  if (params == null) {
    return
  }
  for (const key of paramKeys) {
    const value = params[key]
    if (value == null) {
      continue
    }
    if (target[key] instanceof DensityProfile) {
      target[key].copy(value as DensityProfile)
    } else {
      ;(target as any)[key] = value
    }
  }
}

export type TextureChannel = 'r' | 'g' | 'b' | 'a'

export class CloudLayer {
  static readonly DEFAULT = /*#__PURE__*/ new CloudLayer()

  channel: TextureChannel = 'r'
  altitude = 0
  height = 0
  densityScale = 0.2
  shapeAmount = 1
  shapeDetailAmount = 1
  weatherExponent = 1
  shapeAlteringBias = 0.35
  coverageFilterWidth = 0.6
  densityProfile = new DensityProfile(0, 0, 0.75, 0.25)
  shadow = false

  constructor(options?: CloudLayerLike) {
    this.set(options)
  }

  set(options?: CloudLayerLike): this {
    applyOptions(this, options)
    return this
  }

  clone(): CloudLayer {
    return new CloudLayer(this)
  }

  copy(other: CloudLayer): this {
    this.channel = other.channel
    this.altitude = other.altitude
    this.height = other.height
    this.densityScale = other.densityScale
    this.shapeAmount = other.shapeAmount
    this.shapeDetailAmount = other.shapeDetailAmount
    this.weatherExponent = other.weatherExponent
    this.shapeAlteringBias = other.shapeAlteringBias
    this.coverageFilterWidth = other.coverageFilterWidth
    this.densityProfile.copy(other.densityProfile)
    this.shadow = other.shadow
    return this
  }
}
