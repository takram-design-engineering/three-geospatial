import type { Camera } from 'three'
import {
  Discard,
  float,
  Fn,
  If,
  ivec2,
  mix,
  screenCoordinate,
  uv,
  vec3
} from 'three/tsl'
import { TempNode, type NodeBuilder, type TextureNode } from 'three/webgpu'

import {
  cameraFar,
  cameraNear,
  depthToViewZ,
  type Node
} from '@takram/three-geospatial/webgpu'

import {
  isValidScreenLocation,
  MAX_SAMPLES_IN_SLICE,
  screenToUV
} from './common'

export class CoordinateNode extends TempNode {
  depthNode!: TextureNode
  sliceEndpointsNode!: TextureNode
  screenSize!: Node<'vec2'>

  camera!: Camera

  constructor() {
    super('vec3')
  }

  override setup(builder: NodeBuilder): unknown {
    const { depthNode, sliceEndpointsNode, screenSize, camera } = this

    const maxSamplesInSlice = float(MAX_SAMPLES_IN_SLICE)

    return Fn(() => {
      const uvNode = uv().toConst()
      const coordNode = screenCoordinate.toConst()

      const sliceEndPoints = sliceEndpointsNode
        .load(ivec2(coordNode.y, 0))
        .toConst()

      // If slice entry point is outside [-1,1]×[-1,1] area, the slice is
      // completely invisible and we can skip it from further processing.
      // Note that slice exit point can lie outside the screen, if sample
      // locations are optimized.
      If(isValidScreenLocation(sliceEndPoints.xy, screenSize).not(), () => {
        // Discard invalid slices.
        // Such slices will not be marked in the stencil and as a result will
        // always be skipped.
        Discard()
      })

      // Note that due to the rasterization rules, UV coordinates are biased by
      // 0.5 texel size. We need remove this offset:
      let samplePositionOnEpipolarLine: Node<'float'> = uvNode.x.sub(
        float(0.5).div(maxSamplesInSlice)
      )
      // samplePositionOnEpipolarLine is now in the range
      // [0, 1 - 1/MAX_SAMPLES_IN_SLICE]. We need to rescale it to be in [0, 1].
      samplePositionOnEpipolarLine = samplePositionOnEpipolarLine
        .mul(maxSamplesInSlice.div(maxSamplesInSlice.sub(1)))
        .saturate()
        .toConst()

      // Compute interpolated position between entry and exit points:
      const xy = mix(
        sliceEndPoints.xy,
        sliceEndPoints.zw,
        samplePositionOnEpipolarLine
      ).toConst()

      If(isValidScreenLocation(xy, screenSize).not(), () => {
        // Discard pixels that fall behind the screen.
        // This can happen if slice exit point was optimized.
        Discard()
      })

      // View space z for current location.
      const depth = depthNode.sample(screenToUV(xy)).toConst()
      const viewZ = depthToViewZ(depth, cameraNear(camera), cameraFar(camera), {
        perspective: camera.isPerspectiveCamera,
        logarithmic: builder.renderer.logarithmicDepthBuffer
      }).toConst()

      return vec3(xy, viewZ)
    })()
  }
}
