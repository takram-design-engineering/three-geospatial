import {
  AdditiveBlending,
  BufferAttribute,
  InstancedBufferGeometry,
  Line,
  Vector2,
  type BufferGeometry,
  type Camera,
  type Group,
  type Material,
  type Scene
} from 'three'
import {
  Fn,
  globalId,
  If,
  instanceIndex,
  luminance,
  Return,
  storage,
  uniform,
  vec2,
  vec3,
  vertexIndex
} from 'three/tsl'
import {
  LineBasicNodeMaterial,
  StorageBufferAttribute,
  type ComputeNode,
  type NodeMaterial,
  type Renderer,
  type TextureNode
} from 'three/webgpu'

import { reinterpretType } from '@takram/three-geospatial'
import { hsv2rgb, rgb2hsv } from '@takram/three-geospatial/webgpu'

export class VideoWaveform extends Line {
  declare geometry: InstancedBufferGeometry
  declare material: NodeMaterial

  _inputNode: TextureNode | null = null

  private computeNode?: ComputeNode
  private readonly positionBuffer = storage(
    new StorageBufferAttribute(0, 0),
    'vec3'
  )
  private readonly colorBuffer = storage(
    new StorageBufferAttribute(0, 0),
    'vec3'
  )
  private readonly lineCount = uniform(new Vector2(), 'uvec2')

  constructor(
    inputNode?: TextureNode | null,
    horizontalCount = 256,
    verticalCount = 256
  ) {
    super()
    this.inputNode = inputNode ?? null

    this.geometry = new InstancedBufferGeometry()
    this.material = new LineBasicNodeMaterial()
    this.material.transparent = true
    this.material.opacity = 0.05
    this.material.blending = AdditiveBlending

    const index = instanceIndex.mul(this.lineCount.x).add(vertexIndex)
    this.material.positionNode = this.positionBuffer.element(index)
    this.material.colorNode = this.colorBuffer.element(index).toVertexStage()

    this.setLineCount(horizontalCount, verticalCount)
  }

  get inputNode(): TextureNode | null {
    return this._inputNode
  }

  set inputNode(value: TextureNode | null) {
    this._inputNode = value
    this.setupComputeNode()
  }

  private setupComputeNode(): void {
    const { inputNode, lineCount } = this
    if (inputNode == null) {
      this.computeNode = undefined
      return
    }

    this.computeNode = Fn(() => {
      If(globalId.xy.greaterThanEqual(lineCount).any(), () => {
        Return()
      })

      const index = globalId.y.mul(lineCount.x).add(globalId.x)
      const uv = vec2(globalId.xy).add(0.5).div(vec2(lineCount))
      const color = inputNode.sample(uv).rgb

      this.colorBuffer
        .element(index)
        .assign(hsv2rgb(vec3(rgb2hsv(color).xy, 1)))
      this.positionBuffer
        .element(index)
        .assign(vec3(vec2(uv.x, luminance(color)).sub(0.5), 0))
    })().compute(0)
  }

  setLineCount(horizontal: number, vertical: number): this {
    const bufferCount = horizontal * vertical * 3
    this.positionBuffer.value = new StorageBufferAttribute(bufferCount, 3)
    this.colorBuffer.value = new StorageBufferAttribute(bufferCount, 3)
    this.lineCount.value.set(horizontal, vertical)

    // TODO: Buffering with setDrawRange
    this.geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array(horizontal * 3), 3)
    )
    this.geometry.instanceCount = vertical
    this.count = vertical
    return this
  }

  override onBeforeRender(
    renderer: unknown,
    scene: Scene,
    camera: Camera,
    geometry: BufferGeometry,
    material: Material,
    group: Group
  ): void {
    if (this.computeNode == null) {
      return
    }
    reinterpretType<Renderer>(renderer)
    const lineCount = this.lineCount.value
    void renderer.compute(this.computeNode, [lineCount.x, lineCount.y])
  }

  dispose(): void {
    this.geometry.dispose()
    this.material.dispose()
  }
}
