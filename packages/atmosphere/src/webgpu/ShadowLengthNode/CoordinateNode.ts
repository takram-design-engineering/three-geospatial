import type { Camera } from 'three'
import {
  Discard,
  float,
  Fn,
  If,
  ivec2,
  mix,
  screenCoordinate,
  uv
} from 'three/tsl'
import { TempNode, type NodeBuilder, type TextureNode } from 'three/webgpu'

import {
  cameraFar,
  cameraNear,
  depthToViewZ,
  type Node
} from '@takram/three-geospatial/webgpu'

import { isValidScreenLocation, MAX_SAMPLES_IN_SLICE } from './common'

export class CoordinateNode extends TempNode {
  depthNode!: TextureNode
  sliceEndpointsNode!: TextureNode

  camera!: Camera

  constructor() {
    super('float')
  }

  override setup(builder: NodeBuilder): unknown {
    const { depthNode, sliceEndpointsNode, camera } = this

    return Fn(() => {
      const sliceEndPoints = sliceEndpointsNode
        .load(ivec2(screenCoordinate.y, 0))
        .toConst()

      // If slice entry point is outside [-1,1]x[-1,1] area, the slice is
      // completely invisible and we can skip it from further processing.
      // Note that slice exit point can lie outside the screen, if sample
      // locations are optimized.
      If(isValidScreenLocation(sliceEndPoints.xy).not(), () => {
        // Discard invalid slices.
        // Such slices will not be marked in the stencil and as a result will
        // always be skipped.
        Discard()
      })

      // Note that due to the rasterization rules, UV coordinates are biased by
      // 0.5 texel size. We need remove this offset:
      let samplePositionOnEpipolarLine: Node<'float'> = uv().x.sub(
        float(0.5).div(MAX_SAMPLES_IN_SLICE)
      )
      // samplePositionOnEpipolarLine is now in the range
      // [0, 1 - 1/MAX_SAMPLES_IN_SLICE]. We need to rescale it to be in [0, 1].
      samplePositionOnEpipolarLine = samplePositionOnEpipolarLine.mul(
        float(MAX_SAMPLES_IN_SLICE).div(float(MAX_SAMPLES_IN_SLICE).sub(1))
      )
      samplePositionOnEpipolarLine = samplePositionOnEpipolarLine
        .saturate()
        .toConst()

      // Compute interpolated position between entry and exit points:
      const xy = mix(
        sliceEndPoints.xy,
        sliceEndPoints.zw,
        samplePositionOnEpipolarLine
      ).toConst()

      If(isValidScreenLocation(xy).not(), () => {
        // Discard pixels that fall behind the screen.
        // This can happen if slice exit point was optimized.
        Discard()
      })

      // View space z for current location.
      const depth = depthNode.sample(xy)
      return depthToViewZ(depth, cameraNear(camera), cameraFar(camera), {
        perspective: camera.isPerspectiveCamera,
        logarithmic: builder.renderer.logarithmicDepthBuffer
      })
    })()
  }
}
