import {
  cos,
  int,
  logarithmicDepthToViewZ,
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

import type { Node } from './node'

export interface DepthOptions {
  perspective?: boolean
  logarithmic?: boolean
}

export const depthToViewZ = (
  depth: Node<'float'>,
  near: Node<'float'>,
  far: Node<'float'>,
  { perspective = true, logarithmic = false }: DepthOptions = {}
): Node<'float'> => {
  return logarithmic
    ? logarithmicDepthToViewZ(depth, near, far)
    : perspective
      ? perspectiveDepthToViewZ(depth, near, far)
      : orthographicDepthToViewZ(depth, near, far)
}

export const logarithmicToPerspectiveDepth = (
  depth: Node<'float'>,
  near: Node<'float'>,
  far: Node<'float'>
): Node<'float'> => {
  const viewZ = logarithmicDepthToViewZ(depth, near, far)
  return viewZToPerspectiveDepth(viewZ, near, far)
}

export const perspectiveToLogarithmicDepth = (
  depth: Node<'float'>,
  near: Node<'float'>,
  far: Node<'float'>
): Node<'float'> => {
  const viewZ = perspectiveDepthToViewZ(depth, near, far)
  return viewZToLogarithmicDepth(viewZ, near, far)
}

export const screenToPositionView = (
  uv: Node<'vec2'>,
  depth: Node<'float'>,
  viewZ: Node<'float'>,
  projectionMatrix: Node<'mat4'>,
  inverseProjectionMatrix: Node<'mat4'>
): Node<'vec3'> => {
  const scale = projectionMatrix.element(int(2)).element(int(3))
  const offset = projectionMatrix.element(int(3)).element(int(3))
  const clip = vec4(vec3(uv.flipY(), depth).mul(2).sub(1), 1)
  const ndc = clip.mul(viewZ.mul(scale).add(offset))
  return inverseProjectionMatrix.mul(ndc).xyz
}

// A fifth-order polynomial approximation of Turbo color map.
// See: https://observablehq.com/@mbostock/turbo
const turboCoeffs = [
  /*#__PURE__*/ vec3(58.1375, 2.7747, 26.8183),
  /*#__PURE__*/ vec3(-150.5666, 4.2109, -88.5066),
  /*#__PURE__*/ vec3(130.5887, -14.0195, 109.0745),
  /*#__PURE__*/ vec3(-42.3277, 4.8052, -60.1097),
  /*#__PURE__*/ vec3(4.5974, 2.1856, 12.5925),
  /*#__PURE__*/ vec3(0.1357, 0.0914, 0.1067)
]

export const turbo = (x: Node<'float'>): Node<'vec3'> => {
  return turboCoeffs
    .slice(1)
    .reduce<Node>((y, offset) => offset.add(x.mul(y)), turboCoeffs[0])
}

export const depthToColor = (
  depth: Node<'float'>,
  near: Node<'float'>,
  far: Node<'float'>,
  options?: DepthOptions
): Node<'vec3'> => {
  const viewZ = depthToViewZ(depth, near, far, options)
  return turbo(viewZToLogarithmicDepth(viewZ, near, far))
}

export const equirectToDirectionWorld = (uv: Node<'vec2'>): Node<'vec3'> => {
  const lambda = sub(0.5, uv.x).mul(PI2)
  const phi = sub(uv.y, 0.5).mul(PI)
  const cosPhi = cos(phi)
  return vec3(cosPhi.mul(cos(lambda)), sin(phi), cosPhi.mul(sin(lambda)))
}
