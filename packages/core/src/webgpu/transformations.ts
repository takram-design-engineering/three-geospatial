import type { Camera } from 'three'
import {
  float,
  int,
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
import { turbo } from './Turbo'

declare module 'three' {
  interface Camera {
    isPerspectiveCamera?: boolean
  }
}

export const depthToViewZ = /*#__PURE__*/ Fnv(
  (
    camera: Camera,
    depth: NodeObject<'float'>,
    cameraNear: NodeObject<'float'>,
    cameraFar: NodeObject<'float'>
  ): Node<'float'> => {
    return camera.isPerspectiveCamera === true
      ? perspectiveDepthToViewZ(depth, cameraNear, cameraFar)
      : orthographicDepthToViewZ(depth, cameraNear, cameraFar)
  }
)

export const screenToView = /*#__PURE__*/ Fnv(
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

export const depthToColor = /*#__PURE__*/ Fnv(
  (
    camera: Camera,
    depth: NodeObject<'float'>,
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
