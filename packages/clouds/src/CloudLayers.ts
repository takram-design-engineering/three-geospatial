import type { Vector3, Vector4 } from 'three'

import { CloudLayer, type CloudLayerLike } from './CloudLayer'
import type { DensityProfileLike } from './DensityProfile'

type NumericKey = keyof {
  [P in keyof CloudLayer as number extends CloudLayer[P] ? P : never]: any
}

interface Entry {
  value: number
  flag: 0 | 1
}

// prettier-ignore
const entriesScratch: Entry[] = /*#__PURE__*/ Array.from(
  { length: 8 },
  () => ({ value: 0, flag: 0 })
)
// prettier-ignore
const intervalsScratch = /*#__PURE__*/ Array.from(
  { length: 3 },
  () => ({ min: 0, max: 0 })
)

function compareEntries(a: Entry, b: Entry): number {
  return a.value !== b.value ? a.value - b.value : a.flag - b.flag
}

export class CloudLayers extends Array<CloudLayer> {
  static readonly DEFAULT = /*#__PURE__*/ new CloudLayers([
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
  ])

  constructor(options?: readonly CloudLayerLike[]) {
    super(
      new CloudLayer(options?.[0]),
      new CloudLayer(options?.[1]),
      new CloudLayer(options?.[2]),
      new CloudLayer(options?.[3])
    )
  }

  set(options?: readonly CloudLayerLike[]): this {
    this[0].set(options?.[0])
    this[1].set(options?.[1])
    this[2].set(options?.[2])
    this[3].set(options?.[3])
    return this
  }

  reset(): this {
    this[0].copy(CloudLayer.DEFAULT)
    this[1].copy(CloudLayer.DEFAULT)
    this[2].copy(CloudLayer.DEFAULT)
    this[3].copy(CloudLayer.DEFAULT)
    return this
  }

  clone(): CloudLayers {
    return new CloudLayers(this)
  }

  copy(other: CloudLayers): this {
    this[0].copy(other[0])
    this[1].copy(other[1])
    this[2].copy(other[2])
    this[3].copy(other[3])
    return this
  }

  get localWeatherChannels(): string {
    return this[0].channel + this[1].channel + this[2].channel + this[3].channel
  }

  packValues<K extends NumericKey>(key: K, result: Vector4): Vector4 {
    return result.set(this[0][key], this[1][key], this[2][key], this[3][key])
  }

  packSums<A extends NumericKey, B extends NumericKey>(
    a: A,
    b: B,
    result: Vector4
  ): Vector4 {
    return result.set(
      this[0][a] + this[0][b],
      this[1][a] + this[1][b],
      this[2][a] + this[2][b],
      this[3][a] + this[3][b]
    )
  }

  packDensityProfiles<K extends keyof DensityProfileLike>(
    key: K,
    result: Vector4
  ): Vector4 {
    return result.set(
      this[0].densityProfile[key],
      this[1].densityProfile[key],
      this[2].densityProfile[key],
      this[3].densityProfile[key]
    )
  }

  // Redundant, but need to avoid creating garbage here as this runs every frame.
  packIntervalHeights(minIntervals: Vector3, maxIntervals: Vector3): void {
    for (let i = 0; i < 4; ++i) {
      const layer = this[i]
      let entry = entriesScratch[i]
      entry.value = layer.altitude
      entry.flag = 0
      entry = entriesScratch[i + 4]
      entry.value = layer.altitude + layer.height
      entry.flag = 1
    }
    entriesScratch.sort(compareEntries)

    // Reference: https://dilipkumar.medium.com/interval-coding-pattern-068c36197cf5
    let intervalIndex = 0
    let balance = 0
    for (let entryIndex = 0; entryIndex < entriesScratch.length; ++entryIndex) {
      const { value, flag } = entriesScratch[entryIndex]
      if (balance === 0 && entryIndex > 0) {
        const interval = intervalsScratch[intervalIndex++]
        interval.min = entriesScratch[entryIndex - 1].value
        interval.max = value
      }
      balance += flag === 0 ? 1 : -1
    }
    for (; intervalIndex < 3; ++intervalIndex) {
      const interval = intervalsScratch[intervalIndex]
      interval.min = 0
      interval.max = 0
    }

    let interval = intervalsScratch[0]
    minIntervals.x = interval.min
    maxIntervals.x = interval.max
    interval = intervalsScratch[1]
    minIntervals.y = interval.min
    maxIntervals.y = interval.max
    interval = intervalsScratch[2]
    minIntervals.z = interval.min
    maxIntervals.z = interval.max
  }
}
