import {
  attributeArray,
  Fn,
  globalId,
  If,
  Return,
  uniform,
  vec2
} from 'three/tsl'
import {
  StorageBufferAttribute,
  Vector2,
  type ComputeNode,
  type Renderer,
  type TextureNode
} from 'three/webgpu'

export class VideoAnalysis {
  inputNode: TextureNode | null = null

  readonly colorBuffer = attributeArray(0, 'vec3')
  readonly uvBuffer = attributeArray(0, 'vec2')
  readonly size = uniform(new Vector2(), 'uvec2')

  private computeNode?: ComputeNode
  private prevFrame = -1

  constructor(inputNode?: TextureNode | null, width = 960, height = 540) {
    this.inputNode = inputNode ?? null
    this.setSize(width, height)
  }

  setSize(width: number, height: number): this {
    const size = this.size.value
    size.set(width, height)

    const bufferCount = size.width * size.height
    if (bufferCount !== this.colorBuffer.bufferCount) {
      this.colorBuffer.value = new StorageBufferAttribute(bufferCount * 3, 3)
      this.colorBuffer.bufferCount = bufferCount
      this.uvBuffer.value = new StorageBufferAttribute(bufferCount * 2, 2)
      this.uvBuffer.bufferCount = bufferCount
    }
    return this
  }

  private setupComputeNode(): void {
    const { inputNode } = this
    if (inputNode == null) {
      this.computeNode = undefined
      return
    }

    this.computeNode ??= Fn(() => {
      If(globalId.xy.greaterThanEqual(this.size).any(), () => {
        Return()
      })
      const index = globalId.y.mul(this.size.x).add(globalId.x)
      const uv = vec2(globalId.xy).add(0.5).div(vec2(this.size))
      this.colorBuffer.element(index).assign(inputNode.sample(uv).rgb)
      this.uvBuffer.element(index).assign(uv)
    })().compute(0)
  }

  update(renderer: Renderer): void {
    if (renderer == null) {
      return
    }
    if (this.prevFrame === renderer.info.frame) {
      return
    }
    this.prevFrame = renderer.info.frame

    this.setupComputeNode()
    if (this.computeNode == null) {
      return
    }

    const { width, height } = this.size.value
    this.setSize(width, height)
    void renderer.compute(this.computeNode, [width, height])
  }
}
