import { Vector2 } from 'three'
import {
  attributeArray,
  Fn,
  globalId,
  If,
  Return,
  textureSize,
  uniform,
  vec2
} from 'three/tsl'
import type { ComputeNode, Node, Renderer, TextureNode } from 'three/webgpu'
import invariant from 'tiny-invariant'

import {
  OnBeforeFrame,
  resizeStorageBuffer,
  type NodeObject
} from '@takram/three-geospatial/webgpu'

export class RasterTransform {
  inputNode: TextureNode | null = null

  size = uniform(new Vector2(), 'uvec2')

  private readonly colorBuffer = attributeArray(0, 'vec3')
  private readonly uvBuffer = attributeArray(0, 'vec2')

  readonly colors = this.triggerCompute(this.colorBuffer)
  readonly uvs = this.triggerCompute(this.uvBuffer)

  private prevFrame = -1
  private computeNode?: ComputeNode

  constructor(inputNode?: TextureNode | null, width = 960, height = 540) {
    this.inputNode = inputNode ?? null
    this.size.value.set(width, height)
  }

  private triggerCompute<T extends Node>(node: T): NodeObject {
    return Fn(() => {
      OnBeforeFrame(({ renderer }) => {
        if (renderer != null) {
          this.compute(renderer)
        }
      })
      return node
    })()
  }

  private setupComputeNode(): ComputeNode {
    const { inputNode, colorBuffer, uvBuffer, size } = this
    invariant(inputNode != null)

    return (this.computeNode ??= Fn(() => {
      If(globalId.xy.greaterThanEqual(size).any(), () => {
        Return()
      })
      const uv = vec2(globalId.xy).add(0.5).div(vec2(size))
      const inputSize = textureSize(inputNode)
      const inputPosition = uv.mul(inputSize).min(inputSize)

      const color = inputNode.load(inputPosition).rgb
      const index = globalId.y.mul(size.x).add(globalId.x)
      colorBuffer.element(index).assign(color)
      uvBuffer.element(index).assign(uv)
    })().compute(0))
  }

  private compute(renderer: Renderer): void {
    if (
      renderer == null ||
      this.inputNode == null ||
      this.prevFrame === renderer.info.frame
    ) {
      return
    }
    this.prevFrame = renderer.info.frame

    const { width, height } = this.size.value

    const bufferCount = width * height
    resizeStorageBuffer(this.colorBuffer, bufferCount)
    resizeStorageBuffer(this.uvBuffer, bufferCount)

    const computeNode = this.setupComputeNode()
    void renderer.compute(computeNode, [width, height])
  }
}
