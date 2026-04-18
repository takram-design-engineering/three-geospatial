import {
  HalfFloatType,
  LinearFilter,
  RenderTarget,
  RGBAFormat,
  type Camera,
  type Vector2
} from 'three'
import type { CSMShadowNode } from 'three/examples/jsm/csm/CSMShadowNode.js'
import { hash } from 'three/src/nodes/core/NodeUtils.js'
import {
  Fn,
  If,
  max,
  min,
  screenCoordinate,
  uint,
  uvec2,
  vec4
} from 'three/tsl'
import {
  NodeMaterial,
  NodeUpdateType,
  QuadMesh,
  RendererUtils,
  type NodeBuilder,
  type NodeFrame,
  type TextureNode,
  type UniformArrayNode,
  type UniformNode
} from 'three/webgpu'

import {
  bvecAnd,
  bvecNot,
  cameraPositionWorld,
  Node,
  outputTexture
} from '@takram/three-geospatial/webgpu'

import {
  FLOAT_MAX,
  isValidScreenLocation,
  transformSliceToWorld,
  transformWorldToShadowUV
} from './common'

const { resetRendererState, restoreRendererState } = RendererUtils

export class SliceUVDirectionNode extends Node {
  static override get type(): string {
    return 'SliceUVDirectionNode'
  }

  depthNode!: TextureNode
  csmShadowNode!: CSMShadowNode
  sliceEndpointsNode!: TextureNode

  camera!: Camera

  numEpipolarSlices!: number
  maxSamplesInSlice!: number

  firstCascade!: UniformNode<number> // uint
  screenSize!: UniformNode<Vector2> // vec2
  shadowMapTexelSize!: UniformNode<Vector2> // vec2
  shadowCascadeArray!: UniformArrayNode // vec2[]
  shadowMatrixArray!: UniformArrayNode // mat4[]

  private readonly textureNode: TextureNode
  private readonly renderTarget: RenderTarget
  private readonly material = new NodeMaterial()
  private readonly mesh = new QuadMesh(this.material)
  private rendererState?: RendererUtils.RendererState

  constructor() {
    super()
    this.updateBeforeType = NodeUpdateType.RENDER // TODO

    const renderTarget = new RenderTarget(1, 1, {
      depthBuffer: false,
      type: HalfFloatType,
      format: RGBAFormat
    })
    const texture = renderTarget.texture
    texture.name = 'SliceUVDirection'
    texture.minFilter = LinearFilter
    texture.magFilter = LinearFilter
    texture.generateMipmaps = false
    this.renderTarget = renderTarget

    this.textureNode = outputTexture(this, renderTarget.texture)
  }

  override customCacheKey(): number {
    return hash(this.numEpipolarSlices, this.maxSamplesInSlice)
  }

  getTextureNode(): TextureNode {
    return this.textureNode
  }

  override updateBefore({ renderer }: NodeFrame): void {
    if (renderer == null) {
      return
    }

    this.renderTarget.setSize(
      this.numEpipolarSlices,
      this.csmShadowNode.cascades - this.firstCascade.value
    )

    this.rendererState = resetRendererState(renderer, this.rendererState)

    renderer.setRenderTarget(this.renderTarget)
    this.mesh.render(renderer)

    restoreRendererState(renderer, this.rendererState)
  }

  private setupFragmentNode(builder: NodeBuilder): Node<'vec4'> {
    const {
      sliceEndpointsNode,
      screenSize,
      camera,
      firstCascade,
      shadowMapTexelSize,
      shadowCascadeArray,
      shadowMatrixArray
    } = this

    return Fn(() => {
      const sliceIndex = uint(screenCoordinate.x)

      // Load epipolar slice endpoints.
      const sliceEndpoints = sliceEndpointsNode
        .load(uvec2(sliceIndex, 0))
        .toConst()

      const result = vec4(-10000, -10000, 0, 0).toVar() // Incorrect slice UV direction and start

      // All correct entry points are completely inside the
      // [-1+1/W, 1-1/W] x [-1+1/H, 1-1/H] area.
      If(isValidScreenLocation(sliceEndpoints.xy, screenSize), () => {
        const cascadeIndex = uint(screenCoordinate.y).add(firstCascade)
        const shadowMatrix = shadowMatrixArray.element(cascadeIndex)

        // Reconstruct slice exit point position in world space.
        const sliceExitWorld = transformSliceToWorld(
          sliceEndpoints.zw,
          shadowCascadeArray.element(cascadeIndex).y,
          camera
        )
        // Transform it to the shadow map UV.
        const sliceExitUV = transformWorldToShadowUV(
          sliceExitWorld,
          shadowMatrix
        ).xy.toConst()

        // Compute camera position in shadow map UV space.
        const sliceOriginUV = transformWorldToShadowUV(
          cameraPositionWorld(camera),
          shadowMatrix
        ).xy.toVar()

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
