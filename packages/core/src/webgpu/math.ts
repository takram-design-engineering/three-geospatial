import { dot, If, sqrt, struct, vec2, vec4 } from 'three/tsl'

import { FnVar } from './FnVar'
import type { Node } from './node'

// Reference: https://iquilezles.org/articles/intersectors/

export const raySphereIntersection = /*#__PURE__*/ FnVar(
  (
    rayOrigin: Node<'vec3'>,
    rayDirection: Node<'vec3'>,
    center: Node<'vec3'>,
    radius: Node<'float'>
  ) => {
    const a = rayOrigin.sub(center)
    const b = dot(rayDirection, a)
    const c = dot(a, a).sub(radius.pow2())
    const discriminant = b.pow2().sub(c).toVar()

    const intersection = vec2(-1)
    If(discriminant.greaterThanEqual(0), () => {
      const Q = sqrt(discriminant)
      intersection.assign(vec2(b.negate().sub(Q), b.negate().add(Q)))
    })
    return intersection
  }
)

export const raySpheresIntersectionsStruct = /*#__PURE__*/ struct(
  { near: 'vec4', far: 'vec4' },
  'raySpheresIntersections'
)

// Derive ray-sphere intersections with multiple radii at once:
export const raySpheresIntersections = /*#__PURE__*/ FnVar(
  (
    rayOrigin: Node<'vec3'>,
    rayDirection: Node<'vec3'>,
    center: Node<'vec3'>,
    radii: Node // Scalar or vector
  ) => {
    const a = rayOrigin.sub(center)
    const b = dot(rayDirection, a)
    const c = dot(a, a).sub(radii.pow2())
    const discriminant = b.pow2().sub(c).toVar()

    const near = vec4(-1)
    const far = vec4(-1)
    If(discriminant.greaterThanEqual(0), () => {
      const Q = sqrt(discriminant)
      near.assign(b.negate().sub(Q))
      far.assign(b.negate().add(Q))
    })
    return raySpheresIntersectionsStruct(near, far)
  }
)

export const rayEllipsoidIntersection = /*#__PURE__*/ FnVar(
  (
    rayOrigin: Node<'vec3'>,
    rayDirection: Node<'vec3'>,
    radii: Node<'vec3'>
  ): Node<'vec2'> => {
    const ro = rayOrigin.div(radii)
    const rd = rayDirection.div(radii)
    const a = rd.dot(rd)
    const b = ro.dot(rd)
    const c = ro.dot(ro)
    const discriminant = b
      .pow2()
      .sub(a.mul(c.sub(1)))
      .toVar()

    const intersections = vec2(-1)
    If(discriminant.greaterThanEqual(0), () => {
      const Q = sqrt(discriminant)
      intersections.assign(vec2(b.negate().sub(Q), b.negate().add(Q)).div(a))
    })
    return intersections
  }
)
