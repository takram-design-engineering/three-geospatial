import { Vector3 } from 'three'

const vectorScratch = /*#__PURE__*/ new Vector3()

// See: https://en.wikipedia.org/wiki/Geographic_coordinate_conversion
// Reference: https://github.com/CesiumGS/cesium/blob/1.122/packages/engine/Source/Core/scaleToGeodeticSurface.js

export interface ProjectOnEllipsoidSurfaceOptions {
  centerTolerance?: number
}

export function projectOnEllipsoidSurface(
  position: Vector3,
  reciprocalRadiiSquared: Vector3,
  result = new Vector3(),
  options?: ProjectOnEllipsoidSurfaceOptions
): Vector3 | undefined {
  const { x, y, z } = position
  const rx = reciprocalRadiiSquared.x
  const ry = reciprocalRadiiSquared.y
  const rz = reciprocalRadiiSquared.z
  const x2 = x * x * rx
  const y2 = y * y * ry
  const z2 = z * z * rz

  // Compute the squared ellipsoid norm.
  const normSquared = x2 + y2 + z2
  const ratio = Math.sqrt(1 / normSquared)

  // When very close to center or at center.
  if (!Number.isFinite(ratio)) {
    return undefined
  }

  // As an initial approximation, assume that the radial intersection is the
  // projection point.
  const intersection = vectorScratch.copy(position).multiplyScalar(ratio)
  if (normSquared < (options?.centerTolerance ?? 0.1)) {
    return result.copy(intersection)
  }

  // Use the gradient at the intersection point in place of the true unit
  // normal. The difference in magnitude will be absorbed in the multiplier.
  const gradient = intersection
    .multiply(reciprocalRadiiSquared)
    .multiplyScalar(2)

  // Compute the initial guess at the normal vector multiplier.
  let lambda = ((1 - ratio) * position.length()) / (gradient.length() / 2)

  let correction = 0
  let sx: number
  let sy: number
  let sz: number
  let error: number
  do {
    lambda -= correction
    sx = 1 / (1 + lambda * rx)
    sy = 1 / (1 + lambda * ry)
    sz = 1 / (1 + lambda * rz)
    const sx2 = sx * sx
    const sy2 = sy * sy
    const sz2 = sz * sz
    const sx3 = sx2 * sx
    const sy3 = sy2 * sy
    const sz3 = sz2 * sz
    error = x2 * sx2 + y2 * sy2 + z2 * sz2 - 1
    correction = error / ((x2 * sx3 * rx + y2 * sy3 * ry + z2 * sz3 * rz) * -2)
  } while (Math.abs(error) > 1e-12)

  return result.set(x * sx, y * sy, z * sz)
}
