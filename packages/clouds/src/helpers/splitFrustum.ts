import { lerp } from '@takram/three-geospatial'

export type FrustumSplitFunction = (
  length: number,
  near: number,
  far: number,
  lambda?: number,
  result?: number[]
) => number[]

export interface FrustumSplitFunctions {
  uniform: FrustumSplitFunction
  logarithmic: FrustumSplitFunction
  practical: FrustumSplitFunction
}

export type FrustumSplitMode = keyof FrustumSplitFunctions

// See: https://developer.nvidia.com/gpugems/gpugems3/part-ii-light-and-shadows/chapter-10-parallel-split-shadow-maps-programmable-gpus
const modes: FrustumSplitFunctions = {
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
    for (let i = 0; i < count; ++i) {
      const uniform = (near + ((far - near) * (i + 1)) / count) / far
      const logarithmic = (near * (far / near) ** ((i + 1) / count)) / far
      result[i] = lerp(uniform, logarithmic, lambda)
    }
    result.length = count
    return result
  }
}

export const frustumSplitFunctions = modes

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
