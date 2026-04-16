import type { Camera } from 'three'
import { float, vec2, vec3, vec4 } from 'three/tsl'

import {
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
    linearDepth: Node<'float'>,
    camera: Camera
  ): Node<'vec3'> => {
    const farPositionView = inverseProjectionMatrix(camera)
      .mul(vec4(sampleLocation, 1, 1))
      .xyz.toConst()
    const positionView = farPositionView
      .mul(linearDepth.negate().div(farPositionView.z))
      .toConst()
    return inverseViewMatrix(camera).mul(vec4(positionView, 1)).xyz
  }
)
