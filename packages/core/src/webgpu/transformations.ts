import type { Camera } from 'three'
import {
  float,
  int,
  logarithmicDepthToViewZ,
  orthographicDepthToViewZ,
  perspectiveDepthToViewZ,
  reference,
  vec2,
  vec3,
  vec4,
  viewZToOrthographicDepth
} from 'three/tsl'

import { Fnv } from './Fnv'
import type { Node, NodeObject } from './node'

declare module 'three' {
  interface Camera {
    isPerspectiveCamera?: boolean
  }
}

export const depthToViewZ = (
  depth: NodeObject<'float'>,
  cameraNear: NodeObject<'float'>,
  cameraFar: NodeObject<'float'>,
  perspectiveDepth = true,
  logarithmicDepth = false
): Node<'float'> => {
  return logarithmicDepth
    ? logarithmicDepthToViewZ(depth, cameraNear, cameraFar)
    : perspectiveDepth
      ? perspectiveDepthToViewZ(depth, cameraNear, cameraFar)
      : orthographicDepthToViewZ(depth, cameraNear, cameraFar)
}

export const screenToPositionView = /*#__PURE__*/ Fnv(
  (
    uv: NodeObject<'vec2'>,
    depth: NodeObject<'float'>,
    viewZ: NodeObject<'float'>,
    projectionMatrix: NodeObject<'mat4'>,
    inverseProjectionMatrix: NodeObject<'mat4'>
  ): Node<'vec3'> => {
    const scale = projectionMatrix.element(int(2)).element(int(3))
    const offset = projectionMatrix.element(int(3)).element(int(3))
    const flippedUV = vec2(uv.x, uv.y.oneMinus())
    const clip = vec4(vec3(flippedUV, depth).mul(2).sub(1), 1).toVar()
    const clipW = viewZ.mul(scale).add(offset)
    clip.mulAssign(clipW)
    return inverseProjectionMatrix.mul(clip).xyz
  }
)

// A fifth-order polynomial approximation of Turbo color map.
// See: https://observablehq.com/@mbostock/turbo
export const turbo = /*#__PURE__*/ Fnv(
  (x: NodeObject<'float'>): Node<'vec3'> => {
    const coeffs = [
      vec3(-150.5666, 4.2109, -88.5066).toConst(),
      vec3(130.5887, -14.0195, 109.0745).toConst(),
      vec3(-42.3277, 4.8052, -60.1097).toConst(),
      vec3(4.5974, 2.1856, 12.5925).toConst(),
      vec3(0.1357, 0.0914, 0.1067).toConst()
    ]
    return coeffs.reduce<NodeObject>(
      (y, offset) => offset.add(x.mul(y)),
      vec3(58.1375, 2.7747, 26.8183).toConst()
    )
  }
)

export const depthToColor = /*#__PURE__*/ Fnv(
  (
    depth: NodeObject<'float'>,
    camera: Camera,
    near?: number | NodeObject<'float'>,
    far?: number | NodeObject<'float'>
  ): Node<'vec3'> => {
    const cameraNear = reference('near', 'float', camera)
    const cameraFar = reference('far', 'float', camera)
    near = typeof near === 'number' ? float(near) : (near ?? cameraNear)
    far = typeof far === 'number' ? float(far) : (far ?? cameraFar)

    let orthoDepth: NodeObject<'float'>
    if (camera.isPerspectiveCamera === true) {
      const viewZ = perspectiveDepthToViewZ(depth, cameraNear, cameraFar)
      orthoDepth = viewZToOrthographicDepth(
        viewZ,
        near,
        far
      ) as NodeObject<'float'>
    } else {
      orthoDepth = viewZToOrthographicDepth(
        depth,
        near,
        far
      ) as NodeObject<'float'>
    }
    return turbo(orthoDepth.saturate().oneMinus())
  }
)
