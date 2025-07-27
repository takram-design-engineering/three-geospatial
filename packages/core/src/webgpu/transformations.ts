import type { Camera, Matrix4, Vector2, Vector3 } from 'three'
import {
  int,
  orthographicDepthToViewZ,
  perspectiveDepthToViewZ,
  vec3,
  vec4
} from 'three/tsl'

import { Fnv } from './Fnv'
import type { Node, ShaderNode } from './types'

export const depthToViewZ = /*#__PURE__*/ Fnv(
  (
    camera: Camera,
    depth: ShaderNode<number>,
    cameraNear: ShaderNode<number>,
    cameraFar: ShaderNode<number>
  ): Node<number> => {
    return camera.isPerspectiveCamera === true
      ? perspectiveDepthToViewZ(depth, cameraNear, cameraFar)
      : orthographicDepthToViewZ(depth, cameraNear, cameraFar)
  }
)

export const screenToView = /*#__PURE__*/ Fnv(
  (
    uv: ShaderNode<Vector2>,
    depth: ShaderNode<number>,
    viewZ: ShaderNode<number>,
    projectionMatrix: ShaderNode<Matrix4>,
    inverseProjectionMatrix: ShaderNode<Matrix4>
  ): Node<Vector3> => {
    const scale = projectionMatrix.element(int(2)).element(int(3))
    const offset = projectionMatrix.element(int(3)).element(int(3))
    const clip = vec4(vec3(uv, depth).mul(2).sub(1), 1).toVar()
    const clipW = viewZ.mul(scale).add(offset)
    clip.mulAssign(clipW)
    return inverseProjectionMatrix.mul(clip).xyz
  }
)
