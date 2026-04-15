import {
  Box2,
  FloatType,
  LinearFilter,
  RenderTarget,
  RGFormat,
  Vector2
} from 'three'
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
  uniformTexture,
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
  type Renderer,
  type TextureNode
} from 'three/webgpu'
import invariant from 'tiny-invariant'

import { outputTexture, type Node } from '@takram/three-geospatial/webgpu'

const { resetRendererState, restoreRendererState } = RendererUtils

const boxScratch = /*#__PURE__*/ new Box2()
const vector2Scratch = /*#__PURE__*/ new Vector2()

export class MinMaxLevelsNode extends TempNode {
  csmShadowNode!: CSMShadowNode
  sliceUVDirectionNode!: TextureNode

  numEpipolarSlices = 512
  maxSamplesInSlice = 256

  firstCascade = uniform(1, 'uint')

  private readonly textureNode: TextureNode
  private readonly renderTargetA: RenderTarget
  private readonly renderTargetB: RenderTarget
  private readonly gatherMaterial = new NodeMaterial()
  private readonly mipmapMaterial = new NodeMaterial()
  private readonly mesh = new QuadMesh(this.gatherMaterial)
  private rendererState?: RendererUtils.RendererState

  private readonly sourceNode = uniformTexture()
  private readonly offsetNode = uniform('uvec2')

  private prevLightCount = 0

  constructor() {
    super(null)
    this.updateBeforeType = NodeUpdateType.FRAME

    const renderTarget = new RenderTarget(1, 1, {
      depthBuffer: false,
      type: FloatType,
      format: RGFormat
    })
    const rtTexture = renderTarget.texture
    rtTexture.minFilter = LinearFilter
    rtTexture.magFilter = LinearFilter
    rtTexture.generateMipmaps = false

    this.renderTargetA = renderTarget
    this.renderTargetA.texture.name = 'MinMaxLevelsA'
    this.renderTargetB = renderTarget.clone()
    this.renderTargetB.texture.name = 'MinMaxLevelsB'

    this.textureNode = outputTexture(this, this.renderTargetA.texture)
  }

  getTextureNode(): TextureNode {
    return this.textureNode
  }

  private render(renderer: Renderer, width: number, height: number): void {
    const { renderTargetA, renderTargetB, mesh, sourceNode, offsetNode } = this

    this.rendererState = resetRendererState(renderer, this.rendererState)
    renderer.autoClear = false

    let offsetX = 0
    let prevOffsetX = 0
    let parity = 0
    const maxStep = width / 4

    // Note that we start rendering min/max shadow map from step == 2.
    for (let step = 2; step <= maxStep; step *= 2, parity = (parity + 1) % 2) {
      const targetWidth = Math.floor(width / step)
      const [sourceRT, targetRT] =
        parity === 0
          ? [renderTargetB, renderTargetA]
          : [renderTargetA, renderTargetB]

      if (step === 2) {
        // At the initial pass, the shader gathers 8 depths which will be used
        // for PCF filtering at the sample location and its next neighbor along
        // the slice and outputs min/max depths.
        mesh.material = this.gatherMaterial
      } else {
        // At the subsequent passes, the shader loads two min/max values from
        // the next finer level to compute next level of the binary tree.
        mesh.material = this.mipmapMaterial
        sourceNode.value = sourceRT.texture
        offsetNode.value.set(prevOffsetX, offsetX)
      }

      targetRT.viewport.set(offsetX, 0, targetWidth, height)
      renderer.setRenderTarget(targetRT)
      mesh.render(renderer)

      // All the data must reside in 0-th texture, so copy current level, if
      // necessary, from 1-st texture.
      if (parity === 1) {
        boxScratch.min.set(offsetX, 0)
        boxScratch.max.set(offsetX + targetWidth, height)
        vector2Scratch.set(offsetX, 0)
        renderer.copyTextureToTexture(
          renderTargetB.texture,
          renderTargetA.texture,
          boxScratch,
          vector2Scratch
        )
      }

      prevOffsetX = offsetX
      offsetX += targetWidth
    }

    restoreRendererState(renderer, this.rendererState)
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

    const { lights } = csmShadowNode
    if (lights.length !== this.prevLightCount) {
      this.prevLightCount = lights.length
      const { gatherMaterial } = this
      gatherMaterial.fragmentNode = this.setupGatherNode()
      gatherMaterial.needsUpdate = true
    }

    const cascades = csmShadowNode.cascades - firstCascade.value
    const width = Math.max(mapSize.x, mapSize.y)
    const height = cascades * this.numEpipolarSlices
    this.renderTargetA.setSize(width, height)
    this.renderTargetB.setSize(width, height)

    this.render(renderer, width, height)
  }

  private setupGatherNode(): Node<'vec2'> {
    const {
      csmShadowNode,
      sliceUVDirectionNode,
      numEpipolarSlices,
      firstCascade
    } = this

    const { lights, cascades } = csmShadowNode
    invariant(lights.length > 0)
    invariant(lights.length === cascades)

    const textureNodes = lights.map(light => {
      invariant(light.shadow?.map?.depthTexture != null)
      return texture(light.shadow.map.depthTexture)
    })

    return Fn(() => {
      const coordNode = screenCoordinate.toConst()
      const cascadeIndex = floor(coordNode.y.div(numEpipolarSlices))
        .add(firstCascade)
        .toConst()
      const sliceIndex = coordNode.y
        .sub(cascadeIndex.sub(firstCascade).mul(numEpipolarSlices))
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
      for (let cascade = 0; cascade < cascades; ++cascade) {
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

  private setupMipmapNode(): Node<'vec2'> {
    const { sourceNode, offsetNode } = this

    return Fn(() => {
      const coordNode = uvec2(screenCoordinate).toConst()
      const x1 = offsetNode.x
        .add(coordNode.x.sub(offsetNode.y).mul(2))
        .toConst()
      const x2 = x1.add(1).toConst()

      const minMaxDepth1 = sourceNode.load(uvec2(x1, coordNode.y)).toConst()
      const minMaxDepth2 = sourceNode.load(uvec2(x2, coordNode.y)).toConst()
      return vec2(
        min(minMaxDepth1.x, minMaxDepth2.x),
        max(minMaxDepth1.y, minMaxDepth2.y)
      )
    })()
  }

  override setup(builder: NodeBuilder): unknown {
    const { mipmapMaterial } = this
    mipmapMaterial.fragmentNode = this.setupMipmapNode()
    mipmapMaterial.needsUpdate = true

    return this.textureNode
  }

  override dispose(): void {
    this.renderTargetA.dispose()
    this.renderTargetB.dispose()
    this.gatherMaterial.dispose()
    this.mipmapMaterial.dispose()
    this.mesh.geometry.dispose()
    super.dispose()
  }
}
