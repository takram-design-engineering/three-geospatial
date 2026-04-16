import type { Camera } from 'three'
import {
  cameraFar as cameraFarTSL,
  cameraNear as cameraNearTSL,
  cos,
  Fn,
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

import { cameraFar, cameraNear } from './accessors'
import { FnLayout } from './FnLayout'
import type { Node } from './node'

export const depthToViewZ = (
  depth: Node<'float'>,
  camera?: Camera,
  near?: Node<'float'>,
  far?: Node<'float'>
): Node<'float'> => {
  near ??= cameraNear(camera)
  far ??= cameraFar(camera)
  const perspective = camera?.isPerspectiveCamera === true
  return Fn(builder => {
    const logarithmic = builder.renderer.logarithmicDepthBuffer
    return logarithmic
      ? logarithmicDepthToViewZ(depth, near, far)
      : perspective
        ? perspectiveDepthToViewZ(depth, near, far)
        : orthographicDepthToViewZ(depth, near, far)
  })()
}

export const logarithmicToPerspectiveDepth = (
  depth: Node<'float'>,
  near?: Node<'float'>,
  far?: Node<'float'>
): Node<'float'> => {
  near ??= cameraNearTSL
  far ??= cameraFarTSL
  const viewZ = logarithmicDepthToViewZ(depth, near, far)
  return viewZToPerspectiveDepth(viewZ, near, far)
}

export const perspectiveToLogarithmicDepth = (
  depth: Node<'float'>,
  near?: Node<'float'>,
  far?: Node<'float'>
): Node<'float'> => {
  near ??= cameraNearTSL
  far ??= cameraFarTSL
  const viewZ = perspectiveDepthToViewZ(depth, near, far)
  return viewZToLogarithmicDepth(viewZ, near, far)
}

// TODO: Reconsider interface
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
const turboCoeffs: ReadonlyArray<[number, number, number]> = [
  [58.1375, 2.7747, 26.8183],
  [-150.5666, 4.2109, -88.5066],
  [130.5887, -14.0195, 109.0745],
  [-42.3277, 4.8052, -60.1097],
  [4.5974, 2.1856, 12.5925],
  [0.1357, 0.0914, 0.1067]
]

export const turbo = FnLayout({
  name: 'turbo',
  type: 'vec3',
  inputs: [{ name: 'x', type: 'float' }]
})(([x]) => {
  const y = vec3(...turboCoeffs[0]).toVar()
  for (let i = 1; i < turboCoeffs.length; ++i) {
    y.assign(vec3(...turboCoeffs[i]).add(x.mul(y)))
  }
  return y
})

export const depthToColor = (
  depth: Node<'float'>,
  camera?: Camera,
  near?: Node<'float'>,
  far?: Node<'float'>
): Node<'vec3'> => {
  near ??= cameraNear(camera)
  far ??= cameraFar(camera)
  const viewZ = depthToViewZ(depth, camera, near, far)
  return turbo(viewZToLogarithmicDepth(viewZ, near, far))
}

export const equirectToDirectionWorld = FnLayout({
  name: 'equirectToDirectionWorld',
  type: 'vec3',
  inputs: [{ name: 'uv', type: 'vec2' }]
})(([uv]) => {
  const lambda = sub(0.5, uv.x).mul(PI2)
  const phi = sub(uv.y, 0.5).mul(PI)
  const cosPhi = cos(phi)
  return vec3(cosPhi.mul(cos(lambda)), sin(phi), cosPhi.mul(sin(lambda)))
})
