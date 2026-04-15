import { float, vec2, vec4 } from 'three/tsl'

import { FnLayout, FnVar, type Node } from '@takram/three-geospatial/webgpu'

export const FLOAT_MAX = 3.402823466e38

export const NUM_EPIPOLAR_SLICES = 512
export const MAX_SAMPLES_IN_SLICE = 256

// Transform UV to NDC XY:
export const transformUVToScreen = FnLayout({
  name: 'uvToScreen',
  type: 'vec2',
  inputs: [{ name: 'uv', type: 'vec2' }]
})(([uv]) => uv.mul(vec2(2, -2)).add(vec2(-1, 1)))

// Transform NDC XY to UV:
export const transformScreenToUV = FnLayout({
  name: 'transformScreenToUV',
  type: 'vec2',
  inputs: [{ name: 'screen', type: 'vec2' }]
})(([screen]) => screen.mul(vec2(0.5, -0.5)).add(0.5))

export const transformWorldToShadowUV = FnLayout({
  name: 'transformWorldToShadowUV',
  type: 'vec3',
  inputs: [
    { name: 'positionWorld', type: 'vec3' },
    { name: 'worldToShadowUV', type: 'mat4' }
  ]
})(([positionWorld, worldToShadowUVDepth]) => {
  // Shadow map projection matrix is orthographic, so we do not need to divide
  // by w. Applying depth bias results in light leaking through the opaque
  // objects when looking directly at the light source.
  return vec4(positionWorld, 1).mul(worldToShadowUVDepth).xyz
})

// The outermost visible screen pixels centers do not lie exactly on the
// boundary (+1 or -1), but are biased by 0.5 screen pixel size inwards.
// xyzw = (left, bottom, right, top)
export const getOutermostScreenPixelCoords = FnVar(
  (screenSize: Node<'vec2'>): Node<'vec4'> => {
    return vec4(-1, -1, 1, 1).add(vec4(1, 1, -1, -1).div(screenSize.xyxy))
  }
)

// When checking if a point is inside the screen, we must test against the
// biased screen boundaries.
export const isValidScreenLocation = FnVar(
  (xy: Node<'vec2'>, screenSize: Node<'vec2'>): Node<'bool'> => {
    const eps = float(0.2)
    const limit = eps.oneMinus().div(screenSize).oneMinus()
    return xy.abs().lessThanEqual(limit).all()
  }
)
