import { Matrix4, Vector2, type PerspectiveCamera } from 'three'
import type { CSMShadowNode } from 'three/examples/jsm/csm/CSMShadowNode.js'
import {
  Fn,
  If,
  ivec2,
  max,
  min,
  screenCoordinate,
  uniform,
  uniformArray,
  vec4
} from 'three/tsl'
import { TempNode, type NodeBuilder, type TextureNode } from 'three/webgpu'

import {
  bvecAnd,
  bvecNot,
  cameraPositionWorld,
  FnVar,
  inverseProjectionMatrix,
  inverseViewMatrix,
  type Node
} from '@takram/three-geospatial/webgpu'

import {
  FLOAT_MAX,
  isValidScreenLocation,
  transformWorldToShadowUV
} from './common'

declare module 'three/examples/jsm/csm/CSMShadowNode.js' {
  interface CSMShadowNode {
    _cascades: Vector2[] // TODO
  }
}

export class SliceUVDirectionNode extends TempNode {
  depthNode!: TextureNode
  csmShadowNode!: CSMShadowNode
  sliceEndpointsNode!: TextureNode
  screenSize!: Node<'vec2'>

  camera!: PerspectiveCamera

  shadowMapTexelSize = uniform('vec2')
    .setName('shadowMapTexelSize')
    .onFrameUpdate((_, { value }) => {
      const shadow = this.csmShadowNode.lights[0]?.shadow
      if (shadow != null) {
        value.set(1 / shadow.mapSize.x, 1 / shadow.mapSize.y)
      }
    })

  cascadeNearFarArray = uniformArray(
    Array.from({ length: 4 }, () => new Vector2())
  )
    .setName('cascadeNearFarArray')
    .onFrameUpdate((_, self) => {
      const array = self.array as Vector2[]
      const far = Math.min(this.camera.far, this.csmShadowNode.maxFar)
      const cascades = this.csmShadowNode._cascades
      for (let i = 0; i < cascades.length; ++i) {
        const cascade = cascades[i]
        array[i].set(cascade.x * far, cascade.y * far)
      }
    })

  worldToShadowMatrixArray = uniformArray(
    Array.from({ length: 4 }, () => new Matrix4())
  )
    .setName('worldToShadowMatrixArray')
    .onFrameUpdate((_, self) => {
      const array = self.array as Matrix4[]
      const lights = this.csmShadowNode.lights
      for (let i = 0; i < lights.length; ++i) {
        const matrix = lights[i].shadow?.matrix
        if (matrix != null) {
          array[i].copy(matrix)
        }
      }
    })

  constructor() {
    super('vec4')
  }

  override setup(builder: NodeBuilder): unknown {
    const {
      sliceEndpointsNode,
      screenSize,
      camera,
      shadowMapTexelSize,
      cascadeNearFarArray,
      worldToShadowMatrixArray
    } = this

    // TODO:
    const transformSliceToWorld = FnVar(
      (
        positionNDC: Node<'vec2'>,
        cascadeDepth: Node<'float'>
      ): Node<'vec3'> => {
        const farViewPosition = inverseProjectionMatrix(camera)
          .mul(vec4(positionNDC, 1, 1))
          .toConst()
        const farViewPositionXYZ = farViewPosition.xyz.div(farViewPosition.w)
        const positionView = farViewPositionXYZ
          .mul(cascadeDepth.negate().div(farViewPositionXYZ.z))
          .toConst()
        return inverseViewMatrix(camera).mul(vec4(positionView, 1)).xyz
      }
    )

    return Fn(() => {
      const coordNode = screenCoordinate.toConst()
      const sliceIndex = coordNode.x

      // Load epipolar slice endpoints.
      const sliceEndpoints = sliceEndpointsNode
        .load(ivec2(sliceIndex, 0))
        .toConst()

      const result = vec4(-10000, -10000, 0, 0).toVar() // Incorrect slice UV direction and start

      // All correct entry points are completely inside the
      // [-1+1/W, 1-1/W] x [-1+1/H, 1-1/H] area.
      If(isValidScreenLocation(sliceEndpoints.xy, screenSize), () => {
        const cascadeIndex = coordNode.y
        const worldToShadowMatrix =
          worldToShadowMatrixArray.element(cascadeIndex)

        const sliceExitWorld = transformSliceToWorld(
          sliceEndpoints.zw,
          cascadeNearFarArray.element(cascadeIndex).y
        ).toConst()

        // Transform it to the shadow map UV.
        const sliceExitUV = transformWorldToShadowUV(
          sliceExitWorld,
          worldToShadowMatrix
        ).xy

        // Compute camera position in shadow map UV space.
        const sliceOriginUV = transformWorldToShadowUV(
          cameraPositionWorld(camera),
          worldToShadowMatrix
        ).xy

        // Compute slice direction in shadow map UV space.
        const sliceDirection = sliceExitUV.sub(sliceOriginUV).toVar()
        sliceDirection.divAssign(
          max(sliceDirection.x.abs(), sliceDirection.y.abs())
        )

        const boundaryMinMaxXYXY = vec4(0, 0, 1, 1)
          .add(vec4(0.5, 0.5, -0.5, -0.5).mul(shadowMapTexelSize.xyxy))
          .toConst()
        If(
          sliceOriginUV.xyxy
            .sub(boundaryMinMaxXYXY)
            .mul(vec4(1, 1, -1, -1))
            .lessThan(0)
            .any(),
          () => {
            // If slice origin in UV coordinates falls beyond [0,1]x[0,1]
            // region, we have to continue the ray and intersect it with this
            // rectangle.
            //
            //    sliceOriginUV
            //       *
            //        \
            //         \  New sliceOriginUV
            //    1   __\/___
            //       |       |
            //       |       |
            //    0  |_______|
            //       0       1

            // First, compute signed distances from the slice origin to all four
            // boundaries.
            const isValidIntersection = sliceDirection.xyxy
              .abs()
              .greaterThan(1e-6)
              .toVar()
            const distanceToBoundaries = boundaryMinMaxXYXY
              .sub(sliceOriginUV.xyxy)
              .div(sliceDirection.xyxy.add(vec4(bvecNot(isValidIntersection))))
              .toVar()

            // We consider only intersections in the direction of the ray.
            isValidIntersection.assign(
              bvecAnd(isValidIntersection, distanceToBoundaries.greaterThan(0))
            )
            // Compute the second intersection coordinate.
            const intersectionYXYX = sliceOriginUV.yxyx
              .add(distanceToBoundaries.mul(sliceDirection.yxyx))
              .toConst()

            // Select only these coordinates that fall onto the boundary.
            isValidIntersection.assign(
              bvecAnd(
                isValidIntersection,
                bvecAnd(
                  intersectionYXYX.greaterThanEqual(boundaryMinMaxXYXY.yxyx),
                  intersectionYXYX.lessThanEqual(boundaryMinMaxXYXY.wzwz)
                )
              )
            )
            // Replace distances to all incorrect boundaries with the large
            // value.
            distanceToBoundaries.assign(
              vec4(isValidIntersection)
                .mul(distanceToBoundaries)
                .add(vec4(bvecNot(isValidIntersection)).mul(vec4(FLOAT_MAX)))
            )
            // Select the closest valid intersection.
            const minDistance = min(
              distanceToBoundaries.x,
              distanceToBoundaries.y,
              distanceToBoundaries.z,
              distanceToBoundaries.w
            ).toConst()

            // Update origin.
            sliceOriginUV.assign(
              sliceOriginUV.add(minDistance.mul(sliceDirection))
            )
          }
        )

        sliceDirection.mulAssign(shadowMapTexelSize)

        result.assign(vec4(sliceDirection, sliceOriginUV))
      })

      return result
    })()
  }
}
