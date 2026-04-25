// Based on Intel's Outdoor Light Scattering Sample: https://github.com/GameTechDev/OutdoorLightScattering

/**
 * Copyright 2017 Intel Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 *
 * Modified from the original source code.
 */

import type { Camera } from 'three'
import { float, vec2, vec3, vec4 } from 'three/tsl'
import type { TextureNode } from 'three/webgpu'

import {
  cameraFar,
  FnLayout,
  FnVar,
  inverseProjectionMatrix,
  inverseViewMatrix,
  type Node
} from '@takram/three-geospatial/webgpu'

import { getAtmosphereContext } from '../AtmosphereContext'

export const FLOAT_MAX = 3.402823466e38
export const HALF_FLOAT_MAX = 65504

// Transform UV to NDC XY:
export const transformUVToNDC = /*#__PURE__#*/ FnLayout({
  name: 'uvToScreen',
  type: 'vec2',
  inputs: [{ name: 'uv', type: 'vec2' }]
})(([uv]) => uv.mul(vec2(2, -2)).add(vec2(-1, 1)))

// Transform NDC XY to UV:
export const transformNDCToUV = /*#__PURE__#*/ FnLayout({
  name: 'transformScreenToUV',
  type: 'vec2',
  inputs: [{ name: 'screen', type: 'vec2' }]
})(([screen]) => screen.mul(vec2(0.5, -0.5)).add(0.5))

export const transformUnitToShadowUV = /*#__PURE__#*/ FnLayout({
  name: 'transformUnitToShadowUV',
  type: 'vec3',
  inputs: [
    { name: 'positionUnit', type: 'vec3' },
    { name: 'shadowMatrix', type: 'mat4' }
  ]
})(([positionUnit, shadowMatrix]) => {
  // Shadow map projection matrix is orthographic, so we do not need to divide
  // by w. Applying depth bias results in light leaking through the opaque
  // objects when looking directly at the light source.
  const uvDepth = shadowMatrix.mul(vec4(positionUnit, 1)).xyz
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

// Equivalent to ProjSpaceXYZToWorldSpace:
export const transformSliceToUnit = /*#__PURE__#*/ FnVar(
  (
    sampleLocation: Node<'vec2'>,
    cameraZUnit: Node<'float'>, // -viewZ in unit space
    camera: Camera
  ) =>
    (builder): Node<'vec3'> => {
      const { cameraPositionUnit } = getAtmosphereContext(builder)
      const farPositionView = inverseProjectionMatrix(camera)
        .mul(vec4(sampleLocation, 1, 1))
        .xyz.toConst()
      const positionView = farPositionView
        .mul(cameraZUnit.negate().div(farPositionView.z))
        .toConst()
      return inverseViewMatrix(camera)
        .mul(vec4(positionView, 0))
        .xyz.add(cameraPositionUnit)
    }
)

// Equivalent to GetCamSpaceZ:
export const getCameraZ = /*#__PURE__*/ FnVar(
  (
    camera: Camera,
    uv: Node<'vec2'>,
    viewZNode: TextureNode // viewZ in unit space
  ) =>
    (builder): Node<'float'> => {
      const { parametersNode } = getAtmosphereContext(builder)
      const { worldToUnit } = parametersNode
      // We can sample camera space z texture using bilinear filtering.
      const viewZ = viewZNode.sample(uv).x.toConst()
      // The viewZ can be rendered using MRT, in which case the value of 0 is
      // stored at the sky pixels. We replace it with the camera far.
      const farValue = cameraFar(camera).mul(worldToUnit)
      return viewZ.lessThan(0).select(viewZ.negate(), farValue)
    }
)
