import {
  HalfFloatType,
  RenderTarget,
  RGBAFormat,
  type Camera,
  type Vector2
} from 'three'
import { hash } from 'three/src/nodes/core/NodeUtils.js'
import {
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
  LinearFilter,
  NodeMaterial,
  NodeUpdateType,
  QuadMesh,
  RendererUtils,
  type NodeBuilder,
  type NodeFrame,
  type TextureNode,
  type UniformNode
} from 'three/webgpu'

import { Node, outputTexture } from '@takram/three-geospatial/webgpu'

import {
  getCameraZ,
  isValidScreenLocation,
  transformNDCToUV
} from './common'

const { resetRendererState, restoreRendererState } = RendererUtils

export class CoordinateNode extends Node {
  static override get type(): string {
    return 'CoordinateNode'
  }

  viewZNode?: TextureNode | null // Must be filterable
  depthNode?: TextureNode | null
  sliceEndpointsNode!: TextureNode

  camera!: Camera

  numEpipolarSlices!: number
  maxSamplesInSlice!: number

  screenSize!: UniformNode<Vector2> // vec2

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
    texture.name = 'Coordinate'
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

    this.renderTarget.setSize(this.maxSamplesInSlice, this.numEpipolarSlices)

    this.rendererState = resetRendererState(renderer, this.rendererState)

    renderer.setRenderTarget(this.renderTarget)
    this.mesh.render(renderer)

    restoreRendererState(renderer, this.rendererState)
  }

  private setupFragmentNode(builder: NodeBuilder): Node<'vec3'> {
    const { viewZNode, depthNode, sliceEndpointsNode, screenSize, camera } =
      this

    const maxSamplesInSlice = float(this.maxSamplesInSlice)

    return Fn(() => {
      const uvNode = uv().toConst()

      const sliceEndPoints = sliceEndpointsNode
        .load(ivec2(screenCoordinate.y, 0))
        .toConst()

      // Initialize with an invalid coordinate. Such slices will be be skipped
      // in EpipolarShadowLengthNode.
      const result = vec3(-2, -2, 0).toVar()

      // If slice entry point is outside [-1,1]×[-1,1] area, the slice is
      // completely invisible and we can skip it from further processing.
      // Note that slice exit point can lie outside the screen, if sample
      // locations are optimized.
      If(isValidScreenLocation(sliceEndPoints.xy, screenSize), () => {
        // Note that due to the rasterization rules, UV coordinates are biased
        // by 0.5 texel size. We need remove this offset:
        let samplePositionOnEpipolarLine: Node<'float'> = uvNode.x.sub(
          float(0.5).div(maxSamplesInSlice)
        )
        // samplePositionOnEpipolarLine is now in the range
        // [0, 1 - 1/maxSamplesInSlice]. We need to rescale it to be in [0, 1].
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

        // Discard pixels that fall behind the screen.
        // This can happen if slice exit point was optimized.
        If(isValidScreenLocation(xy, screenSize), () => {
          const cameraZ = getCameraZ(
            camera,
            transformNDCToUV(xy),
            viewZNode,
            depthNode
          )
          result.assign(vec3(xy, cameraZ))
        })
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
