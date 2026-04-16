import {
  FloatType,
  LinearFilter,
  Matrix4,
  PerspectiveCamera,
  RenderTarget,
  RGBAFormat,
  Vector2,
  type Camera
} from 'three'
import type { CSMShadowNode } from 'three/examples/jsm/csm/CSMShadowNode.js'
import {
  Fn,
  If,
  max,
  min,
  OnObjectUpdate,
  renderGroup,
  screenCoordinate,
  uint,
  uniform,
  uniformArray,
  uvec2,
  vec4
} from 'three/tsl'
import {
  NodeMaterial,
  NodeUpdateType,
  QuadMesh,
  RendererUtils,
  TempNode,
  type NodeBuilder,
  type NodeFrame,
  type TextureNode
} from 'three/webgpu'
import invariant from 'tiny-invariant'

import {
  bvecAnd,
  bvecNot,
  cameraPositionWorld,
  outputTexture,
  type Node
} from '@takram/three-geospatial/webgpu'

import {
  FLOAT_MAX,
  isValidScreenLocation,
  transformSliceToWorld,
  transformWorldToShadowUV
} from './common'

declare module 'three/examples/jsm/csm/CSMShadowNode.js' {
  interface CSMShadowNode {
    _cascades: Vector2[] // TODO
  }
}

const { resetRendererState, restoreRendererState } = RendererUtils

export class SliceUVDirectionNode extends TempNode {
  depthNode!: TextureNode
  csmShadowNode!: CSMShadowNode
  sliceEndpointsNode!: TextureNode
  screenSize!: Node<'vec2'>

  camera!: Camera

  numEpipolarSlices = 512
  maxSamplesInSlice = 256

  firstCascade = uniform(1, 'uint')

  private readonly textureNode: TextureNode
  private readonly renderTarget: RenderTarget
  private readonly material = new NodeMaterial()
  private readonly mesh = new QuadMesh(this.material)
  private rendererState?: RendererUtils.RendererState

  constructor() {
    super(null)
    this.updateBeforeType = NodeUpdateType.FRAME

    const renderTarget = new RenderTarget(1, 1, {
      depthBuffer: false,
      type: FloatType,
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

  private setupOutputNode(): Node<'vec4'> {
    const {
      csmShadowNode,
      sliceEndpointsNode,
      screenSize,
      camera,
      firstCascade
    } = this

    invariant(camera instanceof PerspectiveCamera)

    const shadowMapTexelSize = uniform('vec2').onRenderUpdate(
      (_, { value }) => {
        const shadow = csmShadowNode.lights[0]?.shadow
        if (shadow != null) {
          value.set(1 / shadow.mapSize.x, 1 / shadow.mapSize.y)
        }
      }
    )

    const shadowCascadeArray = uniformArray(
      Array.from({ length: csmShadowNode.cascades }, () => new Vector2())
    ).setGroup(renderGroup)

    const shadowMatrixArray = uniformArray(
      Array.from({ length: csmShadowNode.cascades }, () => new Matrix4())
    ).setGroup(renderGroup)

    // uniformArray doesn't appear to support onRenderUpdate.
    OnObjectUpdate(() => {
      const array = shadowCascadeArray.array as Vector2[]
      const far = Math.min(camera.far, csmShadowNode.maxFar)
      const cascades = csmShadowNode._cascades
      for (let i = 0; i < cascades.length; ++i) {
        const cascade = cascades[i]
        array[i].set(cascade.x * far, cascade.y * far)
      }
    })

    OnObjectUpdate(() => {
      const array = shadowMatrixArray.array as Matrix4[]
      const lights = csmShadowNode.lights
      for (let i = 0; i < lights.length; ++i) {
        const matrix = lights[i].shadow?.matrix
        if (matrix != null) {
          array[i].copy(matrix)
        }
      }
    })

    return Fn(() => {
      const coordNode = screenCoordinate.toConst()
      const sliceIndex = uint(coordNode.x)

      // Load epipolar slice endpoints.
      const sliceEndpoints = sliceEndpointsNode
        .load(uvec2(sliceIndex, 0))
        .toConst()

      const result = vec4(-10000, -10000, 0, 0).toVar() // Incorrect slice UV direction and start

      // All correct entry points are completely inside the
      // [-1+1/W, 1-1/W] x [-1+1/H, 1-1/H] area.
      If(isValidScreenLocation(sliceEndpoints.xy, screenSize), () => {
        const cascadeIndex = uint(coordNode.y).add(firstCascade)
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
    material.fragmentNode = this.setupOutputNode()
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
