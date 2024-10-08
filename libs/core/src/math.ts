const DEGREES_TO_RADIANS = (1 / 180) * Math.PI
const RADIANS_TO_DEGREES = (1 / Math.PI) * 180

export function radians(degrees: number): number {
  return degrees * DEGREES_TO_RADIANS
}

export function degrees(radians: number): number {
  return radians * RADIANS_TO_DEGREES
}

export function lerp(a: number, b: number, t: number): number {
  return t * b + (1 - t) * a
}

export function inverseLerp(a: number, b: number, x: number): number {
  return a !== b ? (x - a) / (b - a) : 0
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
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
