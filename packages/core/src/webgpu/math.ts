import {
  bool,
  bvec2,
  bvec3,
  bvec4,
  dot,
  If,
  overloadingFn,
  sqrt,
  struct,
  uvec2,
  uvec3,
  uvec4,
  vec2,
  vec4
} from 'three/tsl'

import { FnLayout } from './FnLayout'
import { FnVar } from './FnVar'
import type { Node } from './node'

const bvec2Not = FnLayout({
  name: 'bvecNot',
  type: 'bvec2',
  inputs: [{ name: 'x', type: 'bvec2' }]
})(([x]) => x.notEqual(bool(true)))

const bvec3Not = FnLayout({
  name: 'bvecNot',
  type: 'bvec3',
  inputs: [{ name: 'x', type: 'bvec3' }]
})(([x]) => x.notEqual(bool(true)))

const bvec4Not = FnLayout({
  name: 'bvecNot',
  type: 'bvec4',
  inputs: [{ name: 'x', type: 'bvec4' }]
})(([x]) => x.notEqual(bool(true)))

// @ts-expect-error Missing type
export const bvecNot = overloadingFn([bvec2Not, bvec3Not, bvec4Not])

const bvec2And = FnLayout({
  name: 'bvecAnd',
  type: 'bvec2',
  inputs: [
    { name: 'x', type: 'bvec2' },
    { name: 'y', type: 'bvec2' }
  ]
})(([x, y]) => bvec2(uvec2(x).mul(uvec2(y))))

const bvec3And = FnLayout({
  name: 'bvecAnd',
  type: 'bvec3',
  inputs: [
    { name: 'x', type: 'bvec3' },
    { name: 'y', type: 'bvec3' }
  ]
})(([x, y]) => bvec3(uvec3(x).mul(uvec3(y))))

const bvec4And = FnLayout({
  name: 'bvecAnd',
  type: 'bvec4',
  inputs: [
    { name: 'x', type: 'bvec4' },
    { name: 'y', type: 'bvec4' }
  ]
})(([x, y]) => bvec4(uvec4(x).mul(uvec4(y))))

// @ts-expect-error Missing type
export const bvecAnd = overloadingFn([bvec2And, bvec3And, bvec4And])

const bvec2Or = FnLayout({
  name: 'bvecOr',
  type: 'bvec2',
  inputs: [
    { name: 'x', type: 'bvec2' },
    { name: 'y', type: 'bvec2' }
  ]
})(([x, y]) => uvec2(x).add(uvec2(y)).notEqual(0))

const bvec3Or = FnLayout({
  name: 'bvecOr',
  type: 'bvec3',
  inputs: [
    { name: 'x', type: 'bvec3' },
    { name: 'y', type: 'bvec3' }
  ]
})(([x, y]) => uvec3(x).add(uvec3(y)).notEqual(0))

const bvec4Or = FnLayout({
  name: 'bvecOr',
  type: 'bvec4',
  inputs: [
    { name: 'x', type: 'bvec4' },
    { name: 'y', type: 'bvec4' }
  ]
})(([x, y]) => uvec4(x).add(uvec4(y)).notEqual(0))

// @ts-expect-error Missing type
export const bvecOr = overloadingFn([bvec2Or, bvec3Or, bvec4Or])

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
    const discriminant = b.pow2().sub(c).toConst()

    const intersection = vec2(-1)
    If(discriminant.greaterThanEqual(0), () => {
      const Q = sqrt(discriminant)
      intersection.assign(vec2(b.negate().sub(Q), b.negate().add(Q)))
    })
    return intersection
  }
)

export const raySpheresIntersectionsStruct = /*#__PURE__*/ struct({
  near: 'vec4',
  far: 'vec4'
})

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
    const discriminant = b.pow2().sub(c).toConst()

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
      .toConst()

    const intersections = vec2(-1)
    If(discriminant.greaterThanEqual(0), () => {
      const Q = sqrt(discriminant)
      intersections.assign(vec2(b.negate().sub(Q), b.negate().add(Q)).div(a))
    })
    return intersections
  }
)
