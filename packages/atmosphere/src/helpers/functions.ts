import type { AtmosphereParameters } from '../AtmosphereParameters'

export function safeSqrt(a: number): number {
  return Math.sqrt(Math.max(a, 0))
}

export function clampDistance(d: number): number {
  return Math.max(d, 0)
}

export function rayIntersectsGround(
  atmosphere: AtmosphereParameters,
  r: number,
  mu: number
): boolean {
  const { bottomRadius } = atmosphere
  return mu < 0 && r ** 2 * (mu ** 2 - 1) + bottomRadius ** 2 >= 0
}

export function distanceToTopAtmosphereBoundary(
  atmosphere: AtmosphereParameters,
  r: number,
  mu: number
): number {
  const { topRadius } = atmosphere
  const discriminant = r ** 2 * (mu ** 2 - 1) + topRadius ** 2
  return clampDistance(-r * mu + safeSqrt(discriminant))
}

export function getTextureCoordFromUnitRange(
  x: number,
  textureSize: number
): number {
  return 0.5 / textureSize + x * (1 - 1 / textureSize)
}
