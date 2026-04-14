import { float, vec4 } from 'three/tsl'

import { FnVar, type Node } from '@takram/three-geospatial/webgpu'

export const FLOAT_MAX = 3.402823466e38

export const NUM_EPIPOLAR_SLICES = 512
export const MAX_SAMPLES_IN_SLICE = 256

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
    return xy.lessThan(limit).all()
  }
)
