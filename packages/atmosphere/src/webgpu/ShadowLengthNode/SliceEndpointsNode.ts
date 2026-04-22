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

import {
  HalfFloatType,
  LinearFilter,
  RenderTarget,
  RGBAFormat,
  type Vector2,
  type Vector4
} from 'three'
import { float, Fn, If, max, mix, uint, uv, uvec4, vec2, vec4 } from 'three/tsl'
import {
  NodeMaterial,
  NodeUpdateType,
  QuadMesh,
  RendererUtils,
  type NodeBuilder,
  type NodeFrame,
  type TextureNode,
  type UniformNode
} from 'three/webgpu'

import {
  bvecAnd,
  bvecNot,
  FnVar,
  Node,
  outputTexture
} from '@takram/three-geospatial/webgpu'

import {
  FLOAT_MAX,
  getOutermostScreenPixelCoords,
  isValidScreenLocation
} from './common'

const { resetRendererState, restoreRendererState } = RendererUtils

export class SliceEndpointsNode extends Node {
  static override get type(): string {
    return 'SliceEndpointsNode'
  }

  numEpipolarSlices!: UniformNode<number> // float
  maxSamplesInSlice!: UniformNode<number> // float
  screenSize!: UniformNode<Vector2> // vec2
  lightScreenPosition!: UniformNode<Vector4> // vec4
  isLightOnScreen!: UniformNode<boolean> // bool

  private readonly textureNode: TextureNode
  private readonly renderTarget: RenderTarget
  private readonly material = new NodeMaterial()
  private readonly mesh = new QuadMesh(this.material)
  private rendererState?: RendererUtils.RendererState

  constructor() {
    super()
    this.updateType = NodeUpdateType.FRAME // After CSM's updateBefore
    this.material.name = 'SliceEndpointsNode'
    this.mesh.name = 'SliceEndpointsNode'

    const renderTarget = new RenderTarget(1, 1, {
      depthBuffer: false,
      type: HalfFloatType,
      format: RGBAFormat
    })
    const texture = renderTarget.texture
    texture.name = 'SliceEndpoints'
    texture.minFilter = LinearFilter
    texture.magFilter = LinearFilter
    texture.generateMipmaps = false
    this.renderTarget = renderTarget

    this.textureNode = outputTexture(this, renderTarget.texture)
  }

  getTextureNode(): TextureNode {
    return this.textureNode
  }

  override update({ renderer }: NodeFrame): void {
    if (renderer == null) {
      return
    }

    this.renderTarget.setSize(this.numEpipolarSlices.value, 1)

    this.rendererState = resetRendererState(renderer, this.rendererState)

    renderer.setRenderTarget(this.renderTarget)
    this.mesh.render(renderer)

    restoreRendererState(renderer, this.rendererState)
  }

  private setupFragmentNode(builder: NodeBuilder): Node<'vec4'> {
    const {
      maxSamplesInSlice,
      numEpipolarSlices,
      screenSize,
      lightScreenPosition,
      isLightOnScreen
    } = this

    const getEpipolarLineEntryPoint = FnVar(
      (exitPoint: Node<'vec2'>): Node<'vec2'> => {
        // If light source is on the screen, its location is entry point for
        // each epipolar line.
        const entryPoint = lightScreenPosition.xy.toVar()

        If(isLightOnScreen.not(), () => {
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
          const boundaries = getOutermostScreenPixelCoords(screenSize).toConst()

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
            .div(rayDirection.xyxy.add(vec4(bvecNot(isCorrectIntersection))))
            .toVar()

          // We now need to find first intersection before the intersection with
          // the exit boundary.
          // This means that we need to find maximum intersection distance which
          // is less than distanceToBoundary.
          // We thus need to skip all boundaries, distance to which is greater
          // than the distance to exit boundary.
          isCorrectIntersection.assign(
            bvecAnd(
              isCorrectIntersection,
              distanceToBoundaries.lessThan(distanceToExitBoundary.sub(1e-4))
            )
          )
          distanceToBoundaries.assign(
            vec4(isCorrectIntersection)
              .mul(distanceToBoundaries)
              .add(vec4(bvecNot(isCorrectIntersection)).mul(-FLOAT_MAX))
          )

          const firstIntersectionDistance = max(
            distanceToBoundaries.x,
            distanceToBoundaries.y,
            distanceToBoundaries.z,
            distanceToBoundaries.w
          ).toConst()

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
      const uvNode = uv().toConst()

      // Note that due to the rasterization rules, UV coordinates are biased by
      // 0.5 texel size. We need to remove this offset. Also clamp to [0,1] to
      // fix FP32 precision issues.
      const epipolarSlice = uvNode.x
        .sub(float(0.5).div(numEpipolarSlices))
        .saturate()
        .toConst()

      // epipolarSlice now lies in the range [0, 1 - 1/numEpipolarSlices]
      // 0 defines location in exactly left top corner, 1 - 1/numEpipolarSlices
      // defines position on the top boundary next to the top left corner.
      const boundary = uint(epipolarSlice.mul(4).floor().clamp(0, 3)).toConst()
      const posOnBoundary = epipolarSlice.mul(4).fract().toConst()

      const boundaryFlags = uvec4(boundary)
        .equal(uvec4(0, 1, 2, 3))
        .toConst()

      // Note that in fact the outermost visible screen pixels do not lie
      // exactly on the boundary (+1 or -1), but are biased by 0.5 screen pixel
      // size inwards. Using these adjusted boundaries improves precision and
      // results in smaller number of pixels which require inscattering
      // correction.
      // xyzw = (left, bottom, right, top)
      const outermostScreenPixelCoords =
        getOutermostScreenPixelCoords(screenSize).toConst()

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
        .mul(vec4(1, 1, -1, -1))
        .lessThanEqual(0)
        .toConst()

      const result = vec4(-1000, -1000, -100, -100).toVar() // Invalid epipolar line

      If(bvecAnd(isInvalidBoundary, boundaryFlags).any().not(), () => {
        // Additional check above is required to eliminate false epipolar lines
        // which can appear is shown below. The reason is that we have to use
        // some safety delta when performing check in isValidScreenLocation()
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
          boundaryX.dot(vec4(boundaryFlags)),
          boundaryY.dot(vec4(boundaryFlags))
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
        If(isValidScreenLocation(entryPoint, screenSize), () => {
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
                .mul(maxSamplesInSlice.div(epipolarSliceScreenLength).max(1))
            )
          )
        })

        result.assign(vec4(entryPoint, exitPoint))
      })

      return result
    })()
  }

  override setup(builder: NodeBuilder): unknown {
    const { material } = this
    material.fragmentNode = this.setupFragmentNode(builder)
    material.needsUpdate = true

    return this.textureNode
  }

  override dispose(): void {
    this.renderTarget.dispose()
    this.material.dispose()
    this.mesh.geometry.dispose()
    super.dispose()
  }
}
