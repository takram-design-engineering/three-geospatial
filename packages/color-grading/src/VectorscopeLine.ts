import {
  AdditiveBlending,
  BufferAttribute,
  InstancedBufferGeometry,
  Line,
  Vector2
} from 'three'
import { instanceIndex, uniform, vec3, vertexIndex } from 'three/tsl'
import {
  LineBasicNodeMaterial,
  type NodeMaterial,
  type Renderer
} from 'three/webgpu'
import invariant from 'tiny-invariant'

import {
  hsv2rgb,
  linearToRec709YCbCr,
  rgb2hsv
} from '@takram/three-geospatial/webgpu'

import type { RasterTransform } from './RasterTransform'

export class VectorscopeLine extends Line {
  declare geometry: InstancedBufferGeometry
  declare material: NodeMaterial

  source: RasterTransform | null

  gain = uniform(5)

  private prevSource?: RasterTransform
  private prevVersion?: number
  private readonly prevSize = new Vector2()

  constructor(source?: RasterTransform | null) {
    super()
    this.source = source ?? null

    this.geometry = new InstancedBufferGeometry()
    this.geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array(3), 3)
    )

    this.material = new LineBasicNodeMaterial()
    this.material.blending = AdditiveBlending
  }

  private updateMaterial(): void {
    invariant(this.source != null)
    const { colorBuffer, size } = this.source
    const index = instanceIndex.mod(size.y).mul(size.x).add(vertexIndex)
    const linearColor = colorBuffer.element(index)

    const color = hsv2rgb(vec3(rgb2hsv(linearColor).xy, 1))
    const ycbcr = linearToRec709YCbCr(linearColor)

    this.material.positionNode = vec3(ycbcr.yz, 0)
    this.material.colorNode = color.div(size.y).mul(this.gain).toVertexStage()
    this.material.needsUpdate = true
  }

  override onBeforeRender(renderer: unknown): void {
    if (this.source == null) {
      return
    }
    this.source.compute(renderer as Renderer)

    if (
      this.source !== this.prevSource ||
      this.source.version !== this.prevVersion
    ) {
      this.prevSource = this.source
      this.prevVersion = this.source.version
      this.updateMaterial()
    }

    const size = this.source.size.value
    if (!size.equals(this.prevSize)) {
      this.prevSize.copy(size)
      this.geometry.setAttribute(
        'position',
        new BufferAttribute(new Float32Array(size.x * 3), 3)
      )
      this.geometry.instanceCount = size.y
    }
  }

  dispose(): void {
    this.geometry.dispose()
    this.material.dispose()
  }
}
