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
  Vector2,
  type ComputeNode,
  type Renderer,
  type TextureNode
} from 'three/webgpu'
import invariant from 'tiny-invariant'

export class RasterTransform {
  inputNode: TextureNode | null = null

  colorBuffer = attributeArray(0, 'vec3')
  uvBuffer = attributeArray(0, 'vec2')
  readonly size = uniform(new Vector2(), 'uvec2')

  version = 0

  private prevFrame = -1
  private computeNode?: ComputeNode

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

  private setupComputeNode(): ComputeNode {
    const { inputNode, colorBuffer, uvBuffer, size } = this
    invariant(inputNode != null)

    return (this.computeNode ??= Fn(() => {
      If(globalId.xy.greaterThanEqual(size).any(), () => {
        Return()
      })
      const index = globalId.y.mul(size.x).add(globalId.x)
      const uv = vec2(globalId.xy).add(0.5).div(vec2(size))
      const color = inputNode.sample(uv).rgb
      colorBuffer.element(index).assign(color)
      uvBuffer.element(index).assign(uv)
    })().compute(0))
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

    const bufferCount = width * height
    if (this.colorBuffer.bufferCount !== bufferCount) {
      this.colorBuffer = attributeArray(bufferCount, 'vec3')
      this.uvBuffer = attributeArray(bufferCount, 'vec2')
      this.computeNode = undefined
      this.needsUpdate = true
    }

    const computeNode = this.setupComputeNode()
    void renderer.compute(computeNode, [width, height])
  }
}
