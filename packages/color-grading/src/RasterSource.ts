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
  resizeStorageBuffer
} from '@takram/three-geospatial/webgpu'

export class RasterSource {
  inputNode: TextureNode | null = null

  size = uniform(new Vector2(), 'uvec2')

  private readonly colorBuffer = attributeArray(0, 'vec3')
  private readonly uvBuffer = attributeArray(0, 'vec2')

  readonly colors = this.computeBeforeFrame(this.colorBuffer)
  readonly uvs = this.computeBeforeFrame(this.uvBuffer)

  private prevFrame = -1
  private computeNode?: ComputeNode

  constructor(inputNode?: TextureNode | null, width = 480, height = 270) {
    this.inputNode = inputNode ?? null
    this.size.value.set(width, height)
  }

  private computeBeforeFrame<T extends Node>(node: T): Node {
    return Fn(() => {
      OnBeforeFrame(({ renderer }) => {
        if (renderer != null && this.prevFrame !== renderer.info.frame) {
          this.prevFrame = renderer.info.frame
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
      const inputPosition = uv.mul(inputSize)

      const color = inputNode.load(inputPosition).rgb
      const index = globalId.y.mul(size.x).add(globalId.x)
      colorBuffer.element(index).assign(color)
      uvBuffer.element(index).assign(uv)
    })().compute(0))
  }

  private compute(renderer: Renderer): void {
    if (this.inputNode == null) {
      return
    }
    const { width, height } = this.size.value

    const bufferCount = width * height
    resizeStorageBuffer(this.colorBuffer, bufferCount)
    resizeStorageBuffer(this.uvBuffer, bufferCount)

    const computeNode = this.setupComputeNode()
    void renderer.compute(computeNode, [width, height])
  }
}
