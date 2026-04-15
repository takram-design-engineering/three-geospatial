import { HalfFloatType, LinearFilter, RenderTarget, RGBAFormat } from 'three'
import type { CSMShadowNode } from 'three/examples/jsm/csm/CSMShadowNode.js'
import {
  float,
  floor,
  Fn,
  If,
  max,
  min,
  screenCoordinate,
  texture,
  uniform,
  uvec2,
  vec2
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

import { outputTexture, type Node } from '@takram/three-geospatial/webgpu'

import { NUM_EPIPOLAR_SLICES } from './common'

const { resetRendererState, restoreRendererState } = RendererUtils

export class MinMaxLevelsNode extends TempNode {
  csmShadowNode!: CSMShadowNode
  sliceUVDirectionNode!: TextureNode

  firstCascade = uniform(1, 'uint')

  private readonly textureNode: TextureNode
  private readonly renderTarget: RenderTarget
  private readonly material = new NodeMaterial()
  private readonly mesh = new QuadMesh(this.material)
  private rendererState?: RendererUtils.RendererState

  private prevCascade = 0

  constructor() {
    super('vec3')
    this.updateBeforeType = NodeUpdateType.FRAME

    const renderTarget = new RenderTarget(1, 1, {
      depthBuffer: false,
      type: HalfFloatType,
      format: RGBAFormat
    })
    const texture = renderTarget.texture
    texture.name = 'MinMaxLevels'
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

    const mapSize = this.csmShadowNode.lights[0]?.shadow?.mapSize
    if (mapSize == null) {
      return
    }

    const { csmShadowNode, firstCascade } = this
    const size = Math.max(mapSize.x, mapSize.y)
    const cascades = csmShadowNode.cascades - firstCascade.value
    this.renderTarget.setSize(size, cascades * NUM_EPIPOLAR_SLICES)

    if (csmShadowNode.cascades !== this.prevCascade) {
      this.prevCascade = csmShadowNode.cascades
      const { material } = this
      material.fragmentNode = this.setupOutputNode()
      material.needsUpdate = true
    }

    this.rendererState = resetRendererState(renderer, this.rendererState)

    renderer.setRenderTarget(this.renderTarget)
    this.mesh.render(renderer)

    restoreRendererState(renderer, this.rendererState)
  }

  private setupOutputNode(): Node<'vec2'> {
    const { csmShadowNode, sliceUVDirectionNode, firstCascade } = this

    const textureNodes = csmShadowNode.lights.map(light => {
      invariant(light.shadow?.map?.depthTexture != null)
      return texture(light.shadow.map.depthTexture)
    })

    return Fn(() => {
      const coordNode = screenCoordinate.toConst()
      const cascadeIndex = floor(coordNode.y.div(NUM_EPIPOLAR_SLICES))
        .add(firstCascade)
        .toConst()
      const sliceIndex = coordNode.y
        .sub(cascadeIndex.sub(firstCascade).mul(NUM_EPIPOLAR_SLICES))
        .toConst()

      // Load slice direction in shadow map.
      const sliceUVDirection = sliceUVDirectionNode
        .load(uvec2(sliceIndex, cascadeIndex))
        .toConst()
      // Calculate current sample position on the ray.
      const currentUV = sliceUVDirection.zw
        .add(sliceUVDirection.xy.mul(floor(coordNode.x).mul(2)))
        .toConst()

      const minDepth = float(1).toVar()
      const maxDepth = float(0).toVar()
      // Gather 8 depths which will be used for PCF filtering for this sample
      // and its immediate neighbor along the epipolar slice.
      const mapSize = textureNodes[0].size().toConst()
      for (let cascade = 0; cascade < csmShadowNode.cascades; ++cascade) {
        If(cascadeIndex.equal(cascade), () => {
          for (let i = 0; i <= 1; ++i) {
            const sampleUV = currentUV.add(sliceUVDirection.xy.mul(i)).toConst()
            const sampleCoord = uvec2(sampleUV.mul(mapSize)).toConst()
            // TODO: Add gather() in TextureNode and use it:
            for (let y = 0; y <= 1; ++y) {
              for (let x = 0; x <= 1; ++x) {
                const depth = textureNodes[cascade]
                  .load(sampleCoord.add(uvec2(x, y)))
                  .toConst()
                minDepth.assign(min(minDepth, depth))
                maxDepth.assign(max(maxDepth, depth))
              }
            }
          }
        })
      }

      return vec2(minDepth, maxDepth)
    })()
  }

  override setup(builder: NodeBuilder): unknown {
    return this.textureNode
  }

  override dispose(): void {
    this.renderTarget.dispose()
    this.material.dispose()
    this.mesh.geometry.dispose()
    super.dispose()
  }
}
