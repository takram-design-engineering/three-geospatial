import { dot, If, property, sqrt, struct } from 'three/tsl'

import { FnVar } from './FnVar'
import type { NodeObject } from './node'

export const raySphereIntersectionsStruct = /*#__PURE__*/ struct(
  {
    near: 'vec4',
    far: 'vec4'
  },
  'raySphereIntersections'
)

export const raySphereIntersections = /*#__PURE__*/ FnVar(
  (
    origin: NodeObject<'vec3'>,
    direction: NodeObject<'vec3'>,
    center: NodeObject<'vec3'>,
    radius: NodeObject // Scalar or vector
  ) =>
    builder => {
      const a = origin.sub(center).toVar()
      const b = dot(direction, a).mul(2).toVar()
      const c = dot(a, a).sub(radius.pow2())
      const discriminant = b.pow2().sub(c.mul(4)).toVar()

      const nodeType = radius.getNodeType(builder)
      const near = property(nodeType).assign(-1)
      const far = property(nodeType).assign(-1)
      If(discriminant.greaterThanEqual(0), () => {
        const Q = sqrt(discriminant).toVar()
        near.assign(b.negate().sub(Q).mul(0.5))
        far.assign(b.negate().add(Q).mul(0.5))
      })
      return raySphereIntersectionsStruct(near, far)
    }
)

export const raySphereNearIntersection = /*#__PURE__*/ FnVar(
  (
    origin: NodeObject<'vec3'>,
    direction: NodeObject<'vec3'>,
    center: NodeObject<'vec3'>,
    radius: NodeObject // Scalar or vector
  ) =>
    builder => {
      const a = origin.sub(center).toVar()
      const b = dot(direction, a).mul(2).toVar()
      const c = dot(a, a).sub(radius.pow2())
      const discriminant = b.pow2().sub(c.mul(4)).toVar()

      const nodeType = radius.getNodeType(builder)
      const result = property(nodeType).assign(-1)
      If(discriminant.greaterThanEqual(0), () => {
        const Q = sqrt(discriminant).toVar()
        result.assign(b.negate().sub(Q).mul(0.5))
      })
      return result
    }
)

export const raySphereFarIntersection = /*#__PURE__*/ FnVar(
  (
    origin: NodeObject<'vec3'>,
    direction: NodeObject<'vec3'>,
    center: NodeObject<'vec3'>,
    radius: NodeObject // Scalar or vector
  ) =>
    builder => {
      const a = origin.sub(center).toVar()
      const b = dot(direction, a).mul(2).toVar()
      const c = dot(a, a).sub(radius.pow2())
      const discriminant = b.pow2().sub(c.mul(4)).toVar()

      const nodeType = radius.getNodeType(builder)
      const result = property(nodeType).assign(-1)
      If(discriminant.greaterThanEqual(0), () => {
        const Q = sqrt(discriminant).toVar()
        result.assign(b.negate().add(Q).mul(0.5))
      })
      return result
    }
)
