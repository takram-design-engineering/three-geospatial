import { RenderTarget, RGBAFormat, type Camera } from 'three'
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
import {
  FloatType,
  LinearFilter,
  NodeMaterial,
  NodeUpdateType,
  QuadMesh,
  RendererUtils,
  TempNode,
  type NodeBuilder,
  type NodeFrame,
  type TextureNode
} from 'three/webgpu'

import { outputTexture, type Node } from '@takram/three-geospatial/webgpu'

import { getViewZ, isValidScreenLocation, transformNDCToUV } from './common'

const { resetRendererState, restoreRendererState } = RendererUtils

export class CoordinateNode extends TempNode {
  viewZNode?: TextureNode // Must be filterable
  depthNode?: TextureNode
  sliceEndpointsNode!: TextureNode
  screenSize!: Node<'vec2'>

  camera?: Camera

  numEpipolarSlices = 512
  maxSamplesInSlice = 256

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
    texture.name = 'Coordinate'
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

    this.renderTarget.setSize(this.maxSamplesInSlice, this.numEpipolarSlices)

    this.rendererState = resetRendererState(renderer, this.rendererState)

    renderer.setRenderTarget(this.renderTarget)
    this.mesh.render(renderer)

    restoreRendererState(renderer, this.rendererState)
  }

  private setupOutputNode(): Node<'vec3'> {
    const { viewZNode, depthNode, sliceEndpointsNode, screenSize, camera } =
      this

    const maxSamplesInSlice = float(this.maxSamplesInSlice)

    return Fn(() => {
      const uvNode = uv().toConst()

      const sliceEndPoints = sliceEndpointsNode
        .load(ivec2(screenCoordinate.y, 0))
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

      const cameraZ = getViewZ(
        transformNDCToUV(xy),
        viewZNode,
        depthNode,
        camera
      ).negate()
      return vec3(xy, cameraZ)
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
