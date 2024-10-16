import { lerp } from '@geovanni/core'

export type FrustumSplitMode = 'practical' | 'uniform' | 'logarithmic'

type FrustumSplitFunction = (
  length: number,
  near: number,
  far: number,
  lambda?: number,
  result?: number[]
) => number[]

const arrayScratch: number[] = [] // TODO: Do we really have gain from this?

// See: https://developer.nvidia.com/gpugems/gpugems3/part-ii-light-and-shadows/chapter-10-parallel-split-shadow-maps-programmable-gpus
const modes: Record<FrustumSplitMode, FrustumSplitFunction> = {
  uniform: (count, near, far, _, result = []) => {
    for (let i = 0; i < count; ++i) {
      result[i] = (near + ((far - near) * (i + 1)) / count) / far
    }
    result.length = count
    return result
  },

  logarithmic: (count, near, far, _, result = []) => {
    for (let i = 0; i < count; ++i) {
      result[i] = (near * (far / near) ** ((i + 1) / count)) / far
    }
    result.length = count
    return result
  },

  practical: (count, near, far, lambda = 0.5, result = []) => {
    const uniform = modes.uniform(count, near, far, undefined, arrayScratch)
    const logarithmic = modes.logarithmic(count, near, far, undefined, result)
    for (let i = 0; i < count; ++i) {
      result[i] = lerp(uniform[i], logarithmic[i], lambda)
    }
    return result
  }
}

export function splitFrustum(
  mode: FrustumSplitMode,
  count: number,
  near: number,
  far: number,
  lambda?: number,
  result: number[] = []
): number[] {
  return modes[mode](count, near, far, lambda, result)
}
