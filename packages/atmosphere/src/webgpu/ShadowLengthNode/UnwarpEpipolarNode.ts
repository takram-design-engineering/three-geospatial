import {
  HalfFloatType,
  LinearFilter,
  RedFormat,
  RenderTarget,
  type Camera,
  type Vector2,
  type Vector4
} from 'three'
import { hash } from 'three/src/nodes/core/NodeUtils.js'
import { float, Fn, max, min, uniform, uv, vec2, vec4 } from 'three/tsl'
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
  Node,
  outputTexture,
  textureGather
} from '@takram/three-geospatial/webgpu'

import {
  DEFAULT_MAX_SAMPLES_IN_SLICE,
  DEFAULT_NUM_EPIPOLAR_SLICES,
  getCameraZ,
  getOutermostScreenPixelCoords,
  transformUVToNDC
} from './common'

const { resetRendererState, restoreRendererState } = RendererUtils

export class UnwarpEpipolarNode extends Node {
  static override get type(): string {
    return 'UnwarpEpipolarNode'
  }

  sliceEndpointsNode!: TextureNode
  coordinateNode!: TextureNode
  epipolarShadowLengthNode!: TextureNode
  viewZNode?: TextureNode | null // Must be filterable
  depthNode?: TextureNode | null

  camera!: Camera

  numEpipolarSlices = DEFAULT_NUM_EPIPOLAR_SLICES
  maxSamplesInSlice = DEFAULT_MAX_SAMPLES_IN_SLICE

  screenSize!: UniformNode<Vector2> // vec2
  lightScreenPosition!: UniformNode<Vector4> // vec4

  refinementThreshold = uniform(0.03)

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
      format: RedFormat
    })
    const texture = renderTarget.texture
    texture.name = 'UnwarpEpipolar'
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

    const { width, height } = this.screenSize.value
    this.renderTarget.setSize(width, height)

    this.rendererState = resetRendererState(renderer, this.rendererState)

    renderer.setRenderTarget(this.renderTarget)
    this.mesh.render(renderer)

    restoreRendererState(renderer, this.rendererState)
  }

  private setupFragmentNode(builder: NodeBuilder): Node<'vec4'> {
    const {
      screenSize,
      lightScreenPosition,
      sliceEndpointsNode,
      coordinateNode,
      epipolarShadowLengthNode,
      refinementThreshold,
      viewZNode,
      depthNode,
      camera
    } = this

    const maxSamplesInSlice = float(this.maxSamplesInSlice)
    const numEpipolarSlices = float(this.numEpipolarSlices)

    return Fn(() => {
      const uvNode = uv().toConst()
      const positionNDC = transformUVToNDC(uvNode).toConst()
      const cameraZ = getCameraZ(camera, uvNode, viewZNode, depthNode).toConst()

      // Compute direction of the ray going from the light through the pixel.
      const rayDirection = positionNDC
        .sub(lightScreenPosition.xy)
        .normalize()
        .toConst()

      // Find, which boundary the ray intersects. For this, we will find which
      // two of four half spaces the rayDirection belongs to.
      // Each of four half spaces is produced by the line connecting one of four
      // screen corners and the current pixel:
      //    ________________        _______'________        ________________
      //   |'            . '|      |      '         |      |                |
      //   | '       . '    |      |     '          |   .  |                |
      //   |  '  . '        |      |    '           |     '|.        hs1    |
      //   |   *.           |      |   *     hs0    |      |  '*.           |
      //   |  '   ' .       |      |  '             |      |      ' .       |
      //   | '        ' .   |      | '              |      |          ' .   |
      //   |'____________ '_|      |'_______________|      | ____________ '_.
      //                           '                                          '
      //                           ________________  .     '________________
      //                           |             . '|      |'               |
      //                           |   hs2   . '    |      | '              |
      //                           |     . '        |      |  '             |
      //                           | . *            |      |   *            |
      //                         . '                |      |    '           |
      //                           |                |      | hs3 '          |
      //                           |________________|      |______'_________|
      //                                                           '
      // Note that in fact the outermost visible screen pixels do not lie
      // exactly on the boundary (+1 or -1), but are biased by 0.5 screen pixel
      // size inwards. Using these adjusted boundaries improves precision and
      // results in smaller number of pixels which require correction.
      const boundaries = getOutermostScreenPixelCoords(screenSize).toConst() // left, bottom, right, top
      const halfSpaceEquationTerms = positionNDC.xxyy
        .sub(boundaries.xzyw)
        .mul(rayDirection.yyxx)
        .toConst()
      const halfSpaceFlags = halfSpaceEquationTerms.xyyx
        .lessThan(halfSpaceEquationTerms.zzww)
        .toConst()

      // Now compute mask indicating which of four sectors the rayDirection
      // belongs to and consequently which border the ray intersects:
      //    ________________
      //   |'            . '|         0 : hs3 && !hs0
      //   | '   3   . '    |         1 : hs0 && !hs1
      //   |  '  . '        |         2 : hs1 && !hs2
      //   |0  *.       2   |         3 : hs2 && !hs3
      //   |  '   ' .       |
      //   | '   1    ' .   |
      //   |'____________ '_|
      //
      // Note that sectorFlags now contains true (1) for the exit boundary and
      // false (0) for 3 other.
      const sectorFlags = bvecAnd(
        halfSpaceFlags.wxyz,
        bvecNot(halfSpaceFlags.xyzw)
      ).toConst()

      // Compute distances to boundaries:
      const distanceToBoundaries = boundaries
        .sub(lightScreenPosition.xyxy)
        .div(
          rayDirection.xyxy.add(vec4(rayDirection.xyxy.abs().lessThan(1e-6)))
        )
        .toConst()
      // Select distance to the exit boundary:
      const distanceToExitBoundary = vec4(sectorFlags)
        .dot(distanceToBoundaries)
        .toConst()
      // Compute exit point on the boundary:
      const exitPoint = lightScreenPosition.xy
        .add(rayDirection.mul(distanceToExitBoundary))
        .toConst()

      // Compute epipolar slice for each boundary:
      const epipolarSlice = vec4(0, 0.25, 0.5, 0.75)
        .add(
          exitPoint.yxyx
            .sub(boundaries.wxyz)
            .mul(vec4(-1, 1, 1, -1))
            .div(boundaries.wzwz.sub(boundaries.yxyx))
            .saturate()
            .div(4)
        )
        .toConst()
      // Select the right value:
      const epipolarSliceValue = vec4(sectorFlags).dot(epipolarSlice).toConst()

      // Now find two closest epipolar slices, from which we will interpolate.
      // First, find index of the slice which precedes our slice.
      // Note that 0 <= epipolarSlice <= 1, and both 0 and 1 refer to the first
      // slice.
      const precedingSliceIndex = min(
        epipolarSliceValue.mul(numEpipolarSlices).floor(),
        numEpipolarSlices.sub(1)
      ).toConst()

      // Compute EXACT texture coordinates of preceding and succeeding slices
      // and their weights.
      // Note that slice 0 is stored in the first texel which has exact texture
      // coordinate 0.5 / numEpipolarSlices.
      const sourceSliceV0 = precedingSliceIndex
        .div(numEpipolarSlices)
        .add(float(0.5).div(numEpipolarSlices))
        .toConst()
      const sourceSliceV1 = sourceSliceV0
        .add(float(1).div(numEpipolarSlices))
        .fract()
        .toConst()
      const sourceSliceV = [sourceSliceV0, sourceSliceV1]

      // Compute slice weights.
      const sliceWeight1 = epipolarSliceValue
        .mul(numEpipolarSlices)
        .sub(precedingSliceIndex)
        .toConst()
      const sliceWeight0 = sliceWeight1.oneMinus().toConst()
      const sliceWeights = [sliceWeight0, sliceWeight1]

      const shadowLength = float(0).toVar()
      const totalWeight = float(0).toVar()

      // Unrolled loop for 2 slices:
      for (let i = 0; i < 2; ++i) {
        // Load epipolar line endpoints.
        const sliceEndpoints = sliceEndpointsNode
          .sample(vec2(sourceSliceV[i], 0.5))
          .toConst()

        // Compute line direction on the screen.
        const sliceDirection = sliceEndpoints.zw
          .sub(sliceEndpoints.xy)
          .toConst()
        const sliceLengthSquare = sliceDirection.dot(sliceDirection).toConst()

        // Project current pixel onto the epipolar line.
        const samplePositionOnLine = positionNDC
          .sub(sliceEndpoints.xy)
          .dot(sliceDirection)
          .div(sliceLengthSquare.max(1e-8))
          .toConst()
        // Compute index of the slice on the line.
        // Note that the first sample on the line (samplePositionOnLine==0) is
        // exactly the Entry Point, while the last sample
        // (samplePositionOnLine==1) is exactly the exit point.
        const sampleIndex = samplePositionOnLine
          .mul(maxSamplesInSlice.sub(1))
          .toConst()

        // We have to manually perform bilateral filtering of the texture to
        // eliminate artifacts at depth discontinuities.

        const precedingSampleIndex = sampleIndex.floor().toConst()
        // Get bilinear filtering weight.
        const uWeight = sampleIndex.sub(precedingSampleIndex).toConst()
        // Get texture coordinate of the left source texel. Again, offset by 0.5
        // is essential to align with the texel center.
        const precedingSampleU = precedingSampleIndex
          .add(0.5)
          .div(maxSamplesInSlice)
          .toConst()

        const shadowLengthUV = vec2(precedingSampleU, sourceSliceV[i]).toConst()

        // Gather 4 camera space z values
        // Note that we need to bias sourceColorUV by 0.5 texel size to refer
        // the location between all four texels and get the required values for
        // sure.
        // The values in vec4, which Gather() returns are arranged as follows:
        //   _______ _______
        //  |       |       |
        //  |   x   |   y   |
        //  |_______o_______|  o gather location
        //  |       |       |
        //  |   *w  |   z   |  * sourceColorUV
        //  |_______|_______|
        //  |<----->|
        //     1/shadowLengthTextureSize.x

        const shadowLengthTextureSize = vec2(
          maxSamplesInSlice,
          numEpipolarSlices
        ).toConst()
        const sourceLocationsCameraZ = textureGather(
          coordinateNode,
          shadowLengthUV.add(vec2(0.5).div(shadowLengthTextureSize)),
          2 // Z component
        ).wz

        // Compute depth weights in a way that if the difference is less than
        // the threshold, the weight is 1 and the weights fade out to 0 as the
        // difference becomes larger than the threshold:
        const maxZ = max(sourceLocationsCameraZ, max(cameraZ, 1)).toConst()
        const depthWeights = refinementThreshold
          .div(
            cameraZ
              .sub(sourceLocationsCameraZ)
              .abs()
              .div(maxZ)
              .max(refinementThreshold)
          )
          .saturate()
          .toVar()
        // Note that if the sample is located outside the [-1,1] × [-1,1] area,
        // the sample is invalid and currentCameraZ == invalidCoordinate.
        // Depth weight computed for such sample will be zero.
        depthWeights.assign(depthWeights.pow4())

        // Multiply bilinear weights with the depth weights:
        const bilateralUWeight = vec2(uWeight.oneMinus(), uWeight)
          .mul(depthWeights)
          .mul(sliceWeights[i])
          .toVar()
        // If the sample projection is behind [0,1], we have to discard this
        // slice.
        // We however must take into account the fact that if at least one
        // sample from the two bilinear sources is correct, the sample can still
        // be properly computed.
        //
        //            -1       0       1                  N-2     N-1      N              Sample index
        // |   X   |   X   |   X   |   X   |  ......   |   X   |   X   |   X   |   X   |
        //         1-1/(N-1)   0    1/(N-1)                        1   1+1/(N-1)          samplePositionOnLine
        //             |                                                   |
        //             |<-------------------Clamp range------------------->|
        bilateralUWeight.mulAssign(
          vec2(
            samplePositionOnLine
              .sub(0.5)
              .abs()
              .lessThan(maxSamplesInSlice.sub(1).reciprocal().add(0.5))
          )
        )
        // We now need to compute the following weighted sum:
        // We will use hardware to perform bilinear filtering and get this value
        // using single bilinear fetch:
        const subpixelUOffset = bilateralUWeight.y
          .div(bilateralUWeight.x.add(bilateralUWeight.y).max(0.001))
          .toVar()
        subpixelUOffset.divAssign(shadowLengthTextureSize.x)

        const filteredShadowLength = bilateralUWeight.x
          .add(bilateralUWeight.y)
          .mul(
            epipolarShadowLengthNode.sample(
              shadowLengthUV.add(vec2(subpixelUOffset, 0))
            )
          )
          .toConst()
        shadowLength.addAssign(filteredShadowLength)

        // Update total weight.
        totalWeight.addAssign(bilateralUWeight.dot(vec2(1)))
      }

      return totalWeight
        .greaterThan(1e-6)
        .select(shadowLength.div(totalWeight), 0)
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
