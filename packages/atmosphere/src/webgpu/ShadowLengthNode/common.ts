import type { Camera } from 'three'
import {
  float,
  mix,
  perspectiveDepthToViewZ,
  uvec4,
  vec2,
  vec3,
  vec4
} from 'three/tsl'
import type { TextureNode } from 'three/webgpu'
import invariant from 'tiny-invariant'

import {
  cameraFar,
  cameraNear,
  FnLayout,
  FnVar,
  inverseProjectionMatrix,
  inverseViewMatrix,
  type Node
} from '@takram/three-geospatial/webgpu'

export const FLOAT_MAX = 3.402823466e38

// Transform UV to NDC XY:
export const transformUVToScreen = /*#__PURE__#*/ FnLayout({
  name: 'uvToScreen',
  type: 'vec2',
  inputs: [{ name: 'uv', type: 'vec2' }]
})(([uv]) => uv.mul(vec2(2, -2)).add(vec2(-1, 1)))

// Transform NDC XY to UV:
export const transformScreenToUV = /*#__PURE__#*/ FnLayout({
  name: 'transformScreenToUV',
  type: 'vec2',
  inputs: [{ name: 'screen', type: 'vec2' }]
})(([screen]) => screen.mul(vec2(0.5, -0.5)).add(0.5))

export const transformWorldToShadowUV = /*#__PURE__#*/ FnLayout({
  name: 'transformWorldToShadowUV',
  type: 'vec3',
  inputs: [
    { name: 'positionWorld', type: 'vec3' },
    { name: 'shadowMatrix', type: 'mat4' }
  ]
})(([positionWorld, shadowMatrix]) => {
  // Shadow map projection matrix is orthographic, so we do not need to divide
  // by w. Applying depth bias results in light leaking through the opaque
  // objects when looking directly at the light source.
  const uvDepth = shadowMatrix.mul(vec4(positionWorld, 1)).xyz
  return vec3(uvDepth.x, uvDepth.y.oneMinus(), uvDepth.z) // Flip Y
})

// The outermost visible screen pixels centers do not lie exactly on the
// boundary (+1 or -1), but are biased by 0.5 screen pixel size inwards.
// xyzw = (left, bottom, right, top)
export const getOutermostScreenPixelCoords = /*#__PURE__#*/ FnVar(
  (screenSize: Node<'vec2'>): Node<'vec4'> => {
    return vec4(-1, -1, 1, 1).add(vec4(1, 1, -1, -1).div(screenSize.xyxy))
  }
)

// When checking if a point is inside the screen, we must test against the
// biased screen boundaries.
export const isValidScreenLocation = /*#__PURE__#*/ FnVar(
  (xy: Node<'vec2'>, screenSize: Node<'vec2'>): Node<'bool'> => {
    const eps = float(0.2)
    const limit = eps.oneMinus().div(screenSize).oneMinus()
    return xy.abs().lessThanEqual(limit).all()
  }
)

export const transformSliceToWorld = /*#__PURE__#*/ FnVar(
  (
    sampleLocation: Node<'vec2'>,
    cameraZ: Node<'float'>, // -viewZ
    camera: Camera
  ): Node<'vec3'> => {
    const farPositionView = inverseProjectionMatrix(camera)
      .mul(vec4(sampleLocation, 1, 1))
      .xyz.toConst()
    const positionView = farPositionView
      .mul(cameraZ.negate().div(farPositionView.z))
      .toConst()
    return inverseViewMatrix(camera).mul(vec4(positionView, 1)).xyz
  }
)

export const getViewZ = /*#__PURE__*/ FnVar(
  (
    uv: Node<'vec2'>,
    viewZNode?: TextureNode,
    depthNode?: TextureNode,
    camera?: Camera
  ): Node<'float'> => {
    if (viewZNode != null) {
      return viewZNode.sample(uv).x
    }

    invariant(depthNode != null)
    invariant(camera != null)
    const near = cameraNear(camera)
    const far = cameraFar(camera)

    // Fallback to manual bilinear interpolation of view Z.
    const size = depthNode.size().xy.toConst()
    const coord = uv.mul(size).sub(0.5).clamp(0, size.sub(1)).toConst()
    const prev = coord.floor()
    const next = prev.add(1).min(size.oneMinus())
    const i = uvec4(prev, next)
    const f = coord.fract().toConst()
    const d1 = depthNode.load(i.xy).x
    const d2 = depthNode.load(i.zy).x
    const d3 = depthNode.load(i.xw).x
    const d4 = depthNode.load(i.zw).x
    // TODO: Support reversed and logarithmic depth buffer
    const z1 = perspectiveDepthToViewZ(d1, near, far)
    const z2 = perspectiveDepthToViewZ(d2, near, far)
    const z3 = perspectiveDepthToViewZ(d3, near, far)
    const z4 = perspectiveDepthToViewZ(d4, near, far)
    return mix(mix(z1, z2, f.x), mix(z3, z4, f.x), f.y)
  }
)
