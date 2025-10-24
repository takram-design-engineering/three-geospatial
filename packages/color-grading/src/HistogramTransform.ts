import {
  add,
  atomicAdd,
  atomicLoad,
  attributeArray,
  Fn,
  If,
  localId,
  Loop,
  luminance,
  max,
  numWorkgroups,
  uint,
  uniform,
  uvec2,
  uvec4,
  vec4,
  workgroupArray,
  workgroupBarrier,
  workgroupId
} from 'three/tsl'
import {
  Vector2,
  type ComputeNode,
  type Renderer,
  type TextureNode
} from 'three/webgpu'
import invariant from 'tiny-invariant'

import { linearToRec709 } from '@takram/three-geospatial/webgpu'

const WIDTH = 256
const HEIGHT = 1
const SIZE = WIDTH * HEIGHT

// Based on: https://webgpufundamentals.org/webgpu/lessons/webgpu-compute-shaders-histogram.html
export class HistogramTransform {
  inputNode: TextureNode | null = null

  countBuffer = attributeArray(0, 'uvec4')
  readonly limitsBuffer = attributeArray(1, 'uvec4')
  readonly size = uniform(new Vector2(), 'uvec2')

  version = 0

  private prevFrame = -1
  private mapNode?: ComputeNode
  private reduceNode?: ComputeNode

  // WORKAROUND: WorkgroupInfoNode doesn't have toAtomic()
  private readonly workgroupBuffer = workgroupArray('atomic<u32>', SIZE * 4)
  private readonly reduceStride = uniform(0, 'uint')

  constructor(inputNode?: TextureNode | null, width = 960, height = 540) {
    this.inputNode = inputNode ?? null
    this.size.value.set(width, height)
  }

  // eslint-disable-next-line accessor-pairs
  set needsUpdate(value: boolean) {
    if (value) {
      ++this.version
    }
  }

  private setupMapNode(): ComputeNode {
    const { inputNode, countBuffer, workgroupBuffer, size } = this
    invariant(inputNode != null)

    return (this.mapNode ??= Fn(() => {
      const position = workgroupId.xy.mul(uvec2(WIDTH, HEIGHT)).add(localId.xy)

      If(position.lessThan(size).all(), () => {
        const color = inputNode.load(position).toVar()
        color.assign(linearToRec709(color))
        color.w = luminance(color.rgb)

        for (let i = 0; i < 4; ++i) {
          const channel = uint(i)
          const value = color.element(channel)
          const index = uint(value.mul(SIZE - 1).min(SIZE - 1))
          atomicAdd(workgroupBuffer.element(index.mul(4).add(channel)), uint(1))
        }
      })

      workgroupBarrier()

      const dispatchWidth = size.x.add(WIDTH - 1).div(WIDTH)
      const dispatchIndex = workgroupId.y.mul(dispatchWidth).add(workgroupId.x)
      const index = localId.y.mul(WIDTH).add(localId.x)
      countBuffer
        .element(dispatchIndex.mul(SIZE).add(index))
        .assign(
          uvec4(
            atomicLoad(workgroupBuffer.element(index.mul(4))),
            atomicLoad(workgroupBuffer.element(index.mul(4).add(1))),
            atomicLoad(workgroupBuffer.element(index.mul(4).add(2))),
            atomicLoad(workgroupBuffer.element(index.mul(4).add(3)))
          )
        )
    })().compute(0, [WIDTH, HEIGHT]))
  }

  private setupReduceNode(): ComputeNode {
    const { inputNode, countBuffer, limitsBuffer } = this
    invariant(inputNode != null)

    return (this.reduceNode ??= Fn(() => {
      const index1 = workgroupId.x.mul(this.reduceStride).mul(2)
      const index2 = index1.add(this.reduceStride)
      countBuffer
        .element(index1.mul(SIZE).add(localId.x))
        .assign(
          add(
            countBuffer.element(index1.mul(SIZE).add(localId.x)),
            countBuffer.element(index2.mul(SIZE).add(localId.x))
          )
        )

      // In the first thread in the last workgroup:
      If(numWorkgroups.equal(1), () => {
        workgroupBarrier()
        If(localId.x.equal(0), () => {
          const maxValue = vec4(0).toVar()
          Loop({ start: 0, end: SIZE, condition: '<' }, ({ i }) => {
            maxValue.assign(max(maxValue, countBuffer.element(i)))
          })
          limitsBuffer.element(0).assign(maxValue)
        })
      })
    })().compute(0, [SIZE]))
  }

  compute(renderer: Renderer): void {
    if (
      renderer == null ||
      this.inputNode == null ||
      this.prevFrame === renderer.info.frame
    ) {
      return
    }
    this.prevFrame = renderer.info.frame

    const { width, height } = this.size.value

    const dispatchWidth = Math.ceil(width / WIDTH)
    const dispatchHeight = Math.ceil(height / HEIGHT)
    const dispatchSize = dispatchWidth * dispatchHeight

    const bufferCount = dispatchSize * SIZE
    if (this.countBuffer.bufferCount !== bufferCount) {
      this.countBuffer = attributeArray(bufferCount, 'uvec4')
      this.mapNode = undefined
      this.reduceNode = undefined
      this.needsUpdate = true
    }

    const mapNode = this.setupMapNode()
    void renderer.compute(mapNode, [dispatchWidth, dispatchHeight])

    // Clear the contents:
    this.limitsBuffer.value.needsUpdate = true

    // Reduce the count buffer in place:
    const reduceNode = this.setupReduceNode()
    const stepCount = Math.ceil(Math.log2(dispatchSize))
    let dispatchesLeft = dispatchSize
    for (let i = 0; i < stepCount; ++i) {
      this.reduceStride.value = 2 ** i
      const dispatchCount = Math.floor(dispatchesLeft / 2)
      dispatchesLeft -= dispatchCount
      void renderer.compute(reduceNode, [dispatchCount])
    }
  }
}
