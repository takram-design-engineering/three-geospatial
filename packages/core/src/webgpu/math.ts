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
  vec2
} from 'three/tsl'

import { FnLayout } from './FnLayout'
import { FnVar } from './FnVar'
import type { Node } from './node'

const bvec2Not = /*#__PURE__*/ FnLayout({
  name: 'bvec2Not',
  type: 'bvec2',
  inputs: [{ name: 'x', type: 'bvec2' }]
})(([x]) => x.notEqual(bool(true)))

const bvec3Not = /*#__PURE__*/ FnLayout({
  name: 'bvec3Not',
  type: 'bvec3',
  inputs: [{ name: 'x', type: 'bvec3' }]
})(([x]) => x.notEqual(bool(true)))

const bvec4Not = /*#__PURE__*/ FnLayout({
  name: 'bvec4Not',
  type: 'bvec4',
  inputs: [{ name: 'x', type: 'bvec4' }]
})(([x]) => x.notEqual(bool(true)))

// WORKAROUND: PR on this https://github.com/mrdoob/three.js/pull/33442
export const bvecNot = /*#__PURE__*/ overloadingFn([
  bvec2Not,
  bvec3Not,
  bvec4Not
])

const bvec2And = /*#__PURE__*/ FnLayout({
  name: 'bvec2And',
  type: 'bvec2',
  inputs: [
    { name: 'x', type: 'bvec2' },
    { name: 'y', type: 'bvec2' }
  ]
})(([x, y]) => bvec2(uvec2(x).mul(uvec2(y))))

const bvec3And = /*#__PURE__*/ FnLayout({
  name: 'bvec3And',
  type: 'bvec3',
  inputs: [
    { name: 'x', type: 'bvec3' },
    { name: 'y', type: 'bvec3' }
  ]
})(([x, y]) => bvec3(uvec3(x).mul(uvec3(y))))

const bvec4And = /*#__PURE__*/ FnLayout({
  name: 'bvec4And',
  type: 'bvec4',
  inputs: [
    { name: 'x', type: 'bvec4' },
    { name: 'y', type: 'bvec4' }
  ]
})(([x, y]) => bvec4(uvec4(x).mul(uvec4(y))))

export const bvecAnd = /*#__PURE__*/ overloadingFn([
  bvec2And,
  bvec3And,
  bvec4And
])

const bvec2Or = /*#__PURE__*/ FnLayout({
  name: 'bvec2Or',
  type: 'bvec2',
  inputs: [
    { name: 'x', type: 'bvec2' },
    { name: 'y', type: 'bvec2' }
  ]
})(([x, y]) => uvec2(x).add(uvec2(y)).notEqual(0))

const bvec3Or = /*#__PURE__*/ FnLayout({
  name: 'bvec3Or',
  type: 'bvec3',
  inputs: [
    { name: 'x', type: 'bvec3' },
    { name: 'y', type: 'bvec3' }
  ]
})(([x, y]) => uvec3(x).add(uvec3(y)).notEqual(0))

const bvec4Or = /*#__PURE__*/ FnLayout({
  name: 'bvec4Or',
  type: 'bvec4',
  inputs: [
    { name: 'x', type: 'bvec4' },
    { name: 'y', type: 'bvec4' }
  ]
})(([x, y]) => uvec4(x).add(uvec4(y)).notEqual(0))

export const bvecOr = /*#__PURE__*/ overloadingFn([bvec2Or, bvec3Or, bvec4Or])

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

    // Reference: https://github.com/GameTechDev/OutdoorLightScattering/blob/master/fx/Common.fxh#L148
    const mask = vec2(discriminant.greaterThanEqual(0)).toConst()
    const inverseMask = mask.oneMinus().toConst()
    const Q = sqrt(discriminant.max(0)).toConst()
    const near = mask.mul(b.negate().sub(Q)).sub(inverseMask)
    const far = mask.mul(b.negate().add(Q)).sub(inverseMask)
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
