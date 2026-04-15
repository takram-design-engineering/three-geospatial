import {
  float,
  Fn,
  If,
  max,
  mix,
  screenSize,
  uniform,
  uv,
  uvec4,
  vec2,
  vec4
} from 'three/tsl'
import { TempNode, type NodeBuilder } from 'three/webgpu'

import { FnVar, type Node } from '@takram/three-geospatial/webgpu'

import {
  FLOAT_MAX,
  getOutermostScreenPixelCoords,
  isValidScreenLocation,
  MAX_SAMPLES_IN_SLICE,
  NUM_EPIPOLAR_SLICES
} from './common'

export class SliceEndpointsNode extends TempNode {
  lightScreenPosition!: Node<'vec4'>
  isLightOnScreen!: Node<'bool'>

  constructor() {
    super('vec4')
  }

  override setup(builder: NodeBuilder): unknown {
    const lightScreenPosition = uniform('vec4')
    const isLightOnScreen = uniform('bool')

    const getEpipolarLineEntryPoint = FnVar(
      (exitPoint: Node<'vec2'>): Node<'vec2'> => {
        const entryPoint = vec2(0).toVar()

        If(isLightOnScreen, () => {
          // If light source is on the screen, its location is entry point for
          // each epipolar line.
          entryPoint.assign(lightScreenPosition.xy)
        }).Else(() => {
          // If light source is outside the screen, we need to compute
          // intersection of the ray with the screen boundaries.

          // Compute direction from the light source to the exit point
          // Note that exit point must be located on shrunk screen boundary.
          const rayDirection = exitPoint.xy.sub(lightScreenPosition.xy).toVar()
          const distanceToExitBoundary = rayDirection.length().toConst()
          rayDirection.divAssign(distanceToExitBoundary)

          // Note that in fact the outermost visible screen pixels do not lie
          // exactly on the boundary (+1 or -1), but are biased by 0.5 screen
          // pixel size inwards.
          const boundaries = getOutermostScreenPixelCoords().toConst()

          // Compute signed distances along the ray from the light position to
          // all four boundaries.
          const isCorrectIntersection = rayDirection.xyxy
            .abs()
            .greaterThan(1e-5)
            .toVar()
          // Addition of !isCorrectIntersection is required to prevent division
          // by zero.
          // Note that such incorrect lanes will be masked out anyway.
          const distanceToBoundaries = boundaries
            .sub(lightScreenPosition.xyxy)
            .div(rayDirection.xyxy.add(isCorrectIntersection.not()))

          // We now need to find first intersection before the intersection with
          // the exit boundary.
          // This means that we need to find maximum intersection distance which
          // is less than distanceToBoundary.
          // We thus need to skip all boundaries, distance to which is greater
          // than the distance to exit boundary.
          isCorrectIntersection.assign(
            isCorrectIntersection.and(
              distanceToBoundaries.lessThan(distanceToExitBoundary.sub(1e-4))
            )
          )
          distanceToBoundaries.assign(
            isCorrectIntersection
              .mul(distanceToBoundaries)
              .add(isCorrectIntersection.not().mul(-FLOAT_MAX))
          )

          const firstIntersectionDistance = max(
            distanceToBoundaries.x,
            distanceToBoundaries.y,
            distanceToBoundaries.z,
            distanceToBoundaries.w
          )

          // Now we can compute entry point:
          entryPoint.assign(
            lightScreenPosition.xy.add(
              rayDirection.mul(firstIntersectionDistance)
            )
          )
        })

        return entryPoint
      }
    )

    return Fn(() => {
      // Note that due to the rasterization rules, UV coordinates are biased by
      // 0.5 texel size.
      // We need to remove this offset. Also clamp to [0,1] to fix FP32
      // precision issues.
      const epipolarSlice = uv().x.sub(0.5).div(NUM_EPIPOLAR_SLICES).saturate()

      // epipolarSlice now lies in the range [0, 1 - 1/NUM_EPIPOLAR_SLICES]
      // 0 defines location in exactly left top corner, 1 - 1/NUM_EPIPOLAR_SLICES
      // defines position on the top boundary next to the top left corner.
      const boundary = epipolarSlice
        .mul(4)
        .floor()
        .clamp(0, 3)
        .toUint()
        .toConst()
      const posOnBoundary = epipolarSlice.mul(4).fract().toConst()

      const boundaryFlags = boundary.xxxx.equal(uvec4(0, 1, 2, 3)).toConst()

      // Note that in fact the outermost visible screen pixels do not lie
      // exactly on the boundary (+1 or -1), but are biased by 0.5 screen pixel
      // size inwards. Using these adjusted boundaries improves precision and
      // results in smaller number of pixels which require inscattering
      // correction.
      // xyzw = (left, bottom, right, top)
      const outermostScreenPixelCoords =
        getOutermostScreenPixelCoords().toConst()

      // Check if there can definitely be no correct intersection with the
      // boundary:
      //
      //  Light.x <= LeftBnd    Light.y <= BottomBnd
      //
      //          ____                 ____
      //        .|    |               |    |
      //      .' |____|               |____|
      //     *                           \
      //                                  *
      //     Left Boundary       Bottom Boundary
      //
      //  Light.x >= RightBnd     Light.y >= TopBnd
      //                                  *
      //        ____                   __/_
      //       |    |  .*             |    |
      //       |____|.'               |____|
      //
      //
      //    Right Boundary          Top Boundary
      //
      const isInvalidBoundary = lightScreenPosition.xyxy
        .sub(outermostScreenPixelCoords)
        .mul(1, 1, -1, -1)
        .lessThanEqual(0)
        .toConst()

      const result = vec4(-1000, -1000, -100, -100).toVar()

      If(isInvalidBoundary.dot(boundaryFlags).not().equal(0), () => {
        // Additional check above is required to eliminate false epipolar lines
        // which can appear is shown below. The reason is that we have to use
        // some safety delta when performing check in IsValidScreenLocation()
        // function. If we do not do this, we will miss valid entry points due
        // to precision issues. As a result there could appear false entry
        // points which fall into the safety region, but in fact lie outside
        // the screen boundary:
        //
        //   LeftBnd-Delta LeftBnd
        //                      false epipolar line
        //          |        |  /
        //          |        | /
        //          |        |/         X - false entry point
        //          |        *
        //          |       /|
        //          |------X-|-----------  BottomBnd
        //          |     /  |
        //          |    /   |
        //          |___/____|___________ BottomBnd-Delta
        //
        //

        //             <------
        //   +1   0,1___________0.75
        //          |     3     |
        //        | |           | A
        //        | |0         2| |
        //        V |           | |
        //   -1     |_____1_____|
        //       0.25  ------>  0.5
        //
        //         -1          +1
        //
        // xyzw = (left, bottom, right, top)
        const boundaryX = vec4(0, posOnBoundary, 1, posOnBoundary.oneMinus())
        const boundaryY = vec4(posOnBoundary.oneMinus(), 0, posOnBoundary, 1)

        // Select the right coordinates for the boundary.
        const exitPointOnBoundary = vec2(
          boundaryX.dot(boundaryFlags),
          boundaryY.dot(boundaryFlags)
        ).toConst()
        const exitPoint = mix(
          outermostScreenPixelCoords.xy,
          outermostScreenPixelCoords.zw,
          exitPointOnBoundary
        ).toVar()

        // getEpipolarLineEntryPoint() gets exit point on shrunk boundary.
        const entryPoint = getEpipolarLineEntryPoint(exitPoint).toVar()

        // If epipolar slice is not invisible, advance its exit point if
        // necessary.
        If(isValidScreenLocation(entryPoint), () => {
          // Compute length of the epipolar line in screen pixels:
          const epipolarSliceScreenLength = exitPoint
            .sub(entryPoint)
            .mul(screenSize.div(2))
            .length()
            .toConst()
          // If epipolar line is too short, update epipolar line exit point
          // to provide 1:1 texel to screen pixel correspondence:
          exitPoint.assign(
            entryPoint.add(
              exitPoint
                .sub(entryPoint)
                .mul(
                  float(MAX_SAMPLES_IN_SLICE)
                    .div(epipolarSliceScreenLength)
                    .max(1)
                )
            )
          )
        })

        result.assign(vec4(entryPoint, exitPoint))
      })
    })()
  }
}
