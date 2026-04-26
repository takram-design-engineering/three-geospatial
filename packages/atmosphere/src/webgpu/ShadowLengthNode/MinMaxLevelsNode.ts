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
  Box2,
  HalfFloatType,
  LinearFilter,
  RenderTarget,
  RGFormat,
  Vector2
} from 'three'
import {
  and,
  floor,
  Fn,
  If,
  max,
  min,
  screenCoordinate,
  uniform,
  uniformTexture,
  uvec2,
  vec2,
  vec4
} from 'three/tsl'
import {
  NodeMaterial,
  NodeUpdateType,
  QuadMesh,
  RendererUtils,
  type NodeBuilder,
  type NodeFrame,
  type Renderer,
  type TextureNode,
  type UniformNode
} from 'three/webgpu'

import {
  Node,
  outputTexture,
  textureGather,
  type CascadedShadowMapsNode
} from '@takram/three-geospatial/webgpu'

const { resetRendererState, restoreRendererState } = RendererUtils

const boxScratch = /*#__PURE__*/ new Box2()
const vector2Scratch = /*#__PURE__*/ new Vector2()

export class MinMaxLevelsNode extends Node {
  static override get type(): string {
    return 'MinMaxLevelsNode'
  }

  csmShadowNode!: CascadedShadowMapsNode
  sliceUVDirectionNode!: TextureNode
  shadowDepthNodes!: TextureNode[]

  epipolarSliceCount!: UniformNode<number> // float
  maxSliceSampleCount!: UniformNode<number> // float
  firstCascade!: UniformNode<number> // uint

  private readonly textureNode: TextureNode
  private readonly renderTargetA: RenderTarget
  private readonly renderTargetB: RenderTarget
  private readonly gatherMaterial = new NodeMaterial()
  private readonly mipmapMaterial = new NodeMaterial()
  private readonly mesh = new QuadMesh(this.gatherMaterial)
  private rendererState?: RendererUtils.RendererState

  private readonly mipmapSourceNode = uniformTexture()
  private readonly mipmapOffsetNode = uniform('uvec2')

  constructor() {
    super()
    this.updateType = NodeUpdateType.FRAME // After CSM's updateBefore
    this.gatherMaterial.name = 'MinMaxLevels_gather'
    this.mipmapMaterial.name = 'MinMaxLevels_mipmap'
    this.mesh.name = 'MinMaxLevels'

    const renderTarget = new RenderTarget(1, 1, {
      depthBuffer: false,
      type: HalfFloatType,
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
    const {
      renderTargetA,
      renderTargetB,
      mesh,
      mipmapSourceNode,
      mipmapOffsetNode
    } = this

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
        mipmapSourceNode.value = sourceRT.texture
        mipmapOffsetNode.value.set(prevOffsetX, offsetX)
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

  override update({ renderer }: NodeFrame): void {
    if (renderer == null) {
      return
    }

    const { csmShadowNode } = this

    const mapSize = csmShadowNode.lights[0]?.shadow?.mapSize
    if (mapSize == null) {
      return
    }

    const { cascades: cascadeCount } = csmShadowNode
    const activeCascades = cascadeCount - this.firstCascade.value
    const width = Math.max(mapSize.x, mapSize.y)
    const height = activeCascades * this.epipolarSliceCount.value
    this.renderTargetA.setSize(width, height)
    this.renderTargetB.setSize(width, height)

    this.render(renderer, width, height)
  }

  private setupGatherNode(builder: NodeBuilder): Node<'vec2'> {
    const {
      csmShadowNode,
      sliceUVDirectionNode,
      shadowDepthNodes,
      epipolarSliceCount,
      firstCascade
    } = this

    const { cascades: cascadeCount } = csmShadowNode

    return Fn(() => {
      const cascadeIndex = floor(screenCoordinate.y.div(epipolarSliceCount))
        .add(firstCascade)
        .toConst()
      const sliceIndex = screenCoordinate.y
        .sub(cascadeIndex.sub(firstCascade).mul(epipolarSliceCount))
        .toConst()

      // Load slice direction in shadow map.
      const sliceUVDirection = sliceUVDirectionNode
        .load(uvec2(sliceIndex, cascadeIndex))
        .toConst()
      // Calculate current sample position on the ray.
      const currentUV = sliceUVDirection.zw
        .add(sliceUVDirection.xy.mul(floor(screenCoordinate.x).mul(2)))
        .toConst()

      const minDepths = vec4(1).toVar()
      const maxDepths = vec4(0).toVar()
      // Gather 8 depths which will be used for PCF filtering for this sample
      // and its immediate neighbor along the epipolar slice.
      for (let cascade = 0; cascade < cascadeCount; ++cascade) {
        If(cascadeIndex.equal(cascade), () => {
          for (let i = 0; i <= 1; ++i) {
            const sampleUV = currentUV.add(sliceUVDirection.xy.mul(i)).toConst()
            // When sampleUV is outside [0,1], we skip the gather so that
            // the initial values (min=1, max=0) are preserved. This tells the
            // tree traversal to treat out-of-bounds as fully lit, matching the
            // behavior of samLinearBorder0.
            If(
              and(
                sampleUV.greaterThanEqual(0).all(),
                sampleUV.lessThanEqual(1).all()
              ),
              () => {
                const depths = textureGather(
                  shadowDepthNodes[cascade],
                  sampleUV
                ).toConst()
                minDepths.assign(min(minDepths, depths))
                maxDepths.assign(max(maxDepths, depths))
              }
            )
          }
        })
      }

      return vec2(
        min(minDepths.x, minDepths.y, minDepths.z, minDepths.w),
        max(maxDepths.x, maxDepths.y, maxDepths.z, maxDepths.w)
      )
    })()
  }

  private setupMipmapNode(builder: NodeBuilder): Node<'vec2'> {
    const { mipmapSourceNode: sourceNode, mipmapOffsetNode: offsetNode } = this

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
    const { gatherMaterial, mipmapMaterial } = this
    gatherMaterial.fragmentNode = this.setupGatherNode(builder)
    gatherMaterial.needsUpdate = true
    mipmapMaterial.fragmentNode = this.setupMipmapNode(builder)
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
