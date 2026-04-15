import { RenderTarget, RGBAFormat, type Camera } from 'three'
import {
  Discard,
  float,
  floor,
  Fn,
  fract,
  If,
  ivec2,
  mix,
  perspectiveDepthToViewZ,
  screenCoordinate,
  uv,
  uvec4,
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
import invariant from 'tiny-invariant'

import {
  cameraFar,
  cameraNear,
  FnVar,
  outputTexture,
  type Node
} from '@takram/three-geospatial/webgpu'

import { isValidScreenLocation, transformScreenToUV } from './common'

const { resetRendererState, restoreRendererState } = RendererUtils

export class CoordinateNode extends TempNode {
  depthNode?: TextureNode
  viewZNode?: TextureNode // Must be filterable
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
    const { depthNode, viewZNode, sliceEndpointsNode, screenSize, camera } =
      this

    const maxSamplesInSlice = float(this.maxSamplesInSlice)

    const getViewZ = FnVar((uv: Node<'vec2'>): Node<'float'> => {
      if (viewZNode != null) {
        return viewZNode.sample(uv).x
      }

      invariant(depthNode != null)
      invariant(camera != null)
      const near = cameraNear(camera)
      const far = cameraFar(camera)

      // Fallback to manual bilinear interpolation of view Z.
      const size = depthNode.size().xy.toConst()
      const coord = uv.mul(size).sub(0.5).clamp(0, size.sub(1)).toConst()
      const prev = floor(coord)
      const next = prev.add(1).min(size.oneMinus())
      const i = uvec4(prev, next)
      const f = fract(coord).toConst()
      const d1 = depthNode.load(i.xy).x
      const d2 = depthNode.load(i.zy).x
      const d3 = depthNode.load(i.xw).x
      const d4 = depthNode.load(i.zw).x
      // TODO: Support reversed and logarithmic depth buffer
      const z1 = perspectiveDepthToViewZ(d1, near, far)
      const z2 = perspectiveDepthToViewZ(d2, near, far)
      const z3 = perspectiveDepthToViewZ(d3, near, far)
      const z4 = perspectiveDepthToViewZ(d4, near, far)
      return mix(mix(z1, z2, f.x), mix(z3, z4, f.x), f.y)
    })

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

      return vec3(xy, getViewZ(transformScreenToUV(xy)).negate())
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
