import { MathUtils } from 'three'

export const clamp = MathUtils.clamp
export const euclideanModulo = MathUtils.euclideanModulo
export const inverseLerp = MathUtils.inverseLerp
export const lerp = MathUtils.lerp
export const smoothstep = MathUtils.smoothstep
export const radians = MathUtils.degToRad
export const degrees = MathUtils.radToDeg
export const isPowerOfTwo = MathUtils.isPowerOfTwo
export const ceilPowerOfTwo = MathUtils.ceilPowerOfTwo
export const floorPowerOfTwo = MathUtils.floorPowerOfTwo
export const normalize = MathUtils.normalize

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
