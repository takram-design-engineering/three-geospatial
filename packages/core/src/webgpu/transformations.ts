import {
  cos,
  int,
  logarithmicDepthToViewZ,
  nodeObject,
  orthographicDepthToViewZ,
  perspectiveDepthToViewZ,
  PI,
  PI2,
  sin,
  sub,
  vec3,
  vec4,
  viewZToLogarithmicDepth,
  viewZToPerspectiveDepth
} from 'three/tsl'

import type { Node, NodeObject } from './node'

export interface DepthOptions {
  perspective?: boolean
  logarithmic?: boolean
}

export const depthToViewZ = (
  depth: Node<'float'>,
  near: NodeObject<'float'>,
  far: NodeObject<'float'>,
  { perspective = true, logarithmic = false }: DepthOptions = {}
): NodeObject<'float'> => {
  return (
    logarithmic
      ? logarithmicDepthToViewZ(depth, near, far)
      : perspective
        ? perspectiveDepthToViewZ(depth, near, far)
        : orthographicDepthToViewZ(depth, near, far)
  ) as NodeObject<'float'>
}

export const logarithmicDepthToPerspectiveDepth = (
  depth: Node<'float'>,
  near: NodeObject<'float'>,
  far: NodeObject<'float'>
): NodeObject<'float'> => {
  const viewZ = logarithmicDepthToViewZ(depth, near, far)
  return viewZToPerspectiveDepth(viewZ, near, far) as NodeObject<'float'>
}

export const perspectiveDepthToLogarithmicDepth = (
  depth: Node<'float'>,
  near: NodeObject<'float'>,
  far: NodeObject<'float'>
): NodeObject<'float'> => {
  const viewZ = nodeObject(perspectiveDepthToViewZ(depth, near, far))
  return viewZToLogarithmicDepth(viewZ, near, far) as NodeObject<'float'>
}

export const screenToPositionView = (
  uv: NodeObject<'vec2'>,
  depth: Node<'float'>,
  viewZ: NodeObject<'float'>,
  projectionMatrix: NodeObject<'mat4'>,
  inverseProjectionMatrix: NodeObject<'mat4'>
): NodeObject<'vec3'> => {
  const scale = projectionMatrix.element(int(2)).element(int(3))
  const offset = projectionMatrix.element(int(3)).element(int(3))
  const clip = vec4(vec3(uv.flipY(), depth).mul(2).sub(1), 1)
  const ndc = clip.mul(viewZ.mul(scale).add(offset))
  return inverseProjectionMatrix.mul(ndc).xyz
}

// A fifth-order polynomial approximation of Turbo color map.
// See: https://observablehq.com/@mbostock/turbo
export const turbo = (x: NodeObject<'float'>): NodeObject<'vec3'> => {
  const coeffs = [
    vec3(-150.5666, 4.2109, -88.5066),
    vec3(130.5887, -14.0195, 109.0745),
    vec3(-42.3277, 4.8052, -60.1097),
    vec3(4.5974, 2.1856, 12.5925),
    vec3(0.1357, 0.0914, 0.1067)
  ]
  return coeffs.reduce<NodeObject>(
    (y, offset) => offset.add(x.mul(y)),
    vec3(58.1375, 2.7747, 26.8183)
  )
}

export const depthToColor = (
  depth: Node<'float'>,
  near: NodeObject<'float'>,
  far: NodeObject<'float'>,
  options?: DepthOptions
): NodeObject<'vec3'> => {
  const viewZ = depthToViewZ(depth, near, far, options)
  return turbo(viewZToLogarithmicDepth(viewZ, near, far) as NodeObject<'float'>)
}

export const equirectWorld = (uv: NodeObject<'vec2'>): NodeObject<'vec3'> => {
  const lambda = sub(0.5, uv.x).mul(PI2)
  const phi = sub(uv.y, 0.5).mul(PI)
  const cosPhi = cos(phi)
  return vec3(cosPhi.mul(cos(lambda)), sin(phi), cosPhi.mul(sin(lambda)))
}

export const clampToBorder = (uv: NodeObject<'vec2'>): NodeObject<'float'> => {
  return uv.greaterThanEqual(0).all().and(uv.lessThanEqual(1).all()).toFloat()
}
