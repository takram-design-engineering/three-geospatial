import type { Camera } from 'three'
import {
  int,
  orthographicDepthToViewZ,
  perspectiveDepthToViewZ,
  vec2,
  vec3,
  vec4
} from 'three/tsl'

import { Fnv } from './Fnv'
import type { Node, ShaderNode } from './types'

export const depthToViewZ = /*#__PURE__*/ Fnv(
  (
    camera: Camera,
    depth: ShaderNode<'float'>,
    cameraNear: ShaderNode<'float'>,
    cameraFar: ShaderNode<'float'>
  ): Node<'float'> => {
    return camera.isPerspectiveCamera === true
      ? perspectiveDepthToViewZ(depth, cameraNear, cameraFar)
      : orthographicDepthToViewZ(depth, cameraNear, cameraFar)
  }
)

export const screenToView = /*#__PURE__*/ Fnv(
  (
    uv: ShaderNode<'vec2'>,
    depth: ShaderNode<'float'>,
    viewZ: ShaderNode<'float'>,
    projectionMatrix: ShaderNode<'mat4'>,
    inverseProjectionMatrix: ShaderNode<'mat4'>
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
