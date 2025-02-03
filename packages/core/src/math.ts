import { MathUtils } from 'three'

export const clamp = MathUtils.clamp
export const euclideanModulo = MathUtils.euclideanModulo
export const inverseLerp = MathUtils.inverseLerp
export const lerp = MathUtils.lerp
export const radians = MathUtils.degToRad
export const degrees = MathUtils.radToDeg
export const isPowerOfTwo = MathUtils.isPowerOfTwo
export const ceilPowerOfTwo = MathUtils.ceilPowerOfTwo
export const floorPowerOfTwo = MathUtils.floorPowerOfTwo
export const normalize = MathUtils.normalize

export function remap(x: number, min1: number, max1: number): number
export function remap(
  x: number,
  min1: number,
  max1: number,
  min2: number,
  max2: number
): number
export function remap(
  x: number,
  min1: number,
  max1: number,
  min2 = 0,
  max2 = 1
): number {
  return MathUtils.mapLinear(x, min1, max1, min2, max2)
}

export function remapClamped(x: number, min1: number, max1: number): number
export function remapClamped(
  x: number,
  min1: number,
  max1: number,
  min2: number,
  max2: number
): number
export function remapClamped(
  x: number,
  min1: number,
  max1: number,
  min2 = 0,
  max2 = 1
): number {
  return clamp(MathUtils.mapLinear(x, min1, max1, min2, max2), min2, max2)
}

// Prefer glsl's argument order which differs from that of MathUtils.
export function smoothstep(min: number, max: number, x: number): number {
  if (x <= min) {
    return 0
  }
  if (x >= max) {
    return 1
  }
  x = (x - min) / (max - min)
  return x * x * (3 - 2 * x)
}

export function saturate(x: number): number {
  return Math.min(Math.max(x, 0), 1)
}

export function closeTo(
  a: number,
  b: number,
  relativeEpsilon: number,
  absoluteEpsilon = relativeEpsilon
): boolean {
  const diff = Math.abs(a - b)
  return (
    diff <= absoluteEpsilon ||
    diff <= relativeEpsilon * Math.max(Math.abs(a), Math.abs(b))
  )
}
