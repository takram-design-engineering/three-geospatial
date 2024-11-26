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
