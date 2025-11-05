import {
  AdditiveBlending,
  BufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  Vector2
} from 'three'
import {
  float,
  Fn,
  instanceIndex,
  int,
  max,
  mix,
  screenSize,
  uniform,
  vec3,
  vertexIndex
} from 'three/tsl'
import { MeshBasicNodeMaterial, type NodeMaterial } from 'three/webgpu'
import invariant from 'tiny-invariant'

import type { HistogramSource } from './HistogramSource'

const SIZE = 256

export class HistogramMesh extends Mesh {
  declare geometry: InstancedBufferGeometry
  declare material: NodeMaterial

  source: HistogramSource | null

  gain = uniform(5)

  private prevSource?: HistogramSource
  private readonly prevSize = new Vector2()

  constructor(source?: HistogramSource | null) {
    super()
    this.source = source ?? null

    this.geometry = new InstancedBufferGeometry()
    this.geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array((SIZE + 1) * 6), 3)
    )
    this.geometry.instanceCount = 3

    const indices = new Uint16Array(SIZE * 6)
    for (let i = 0, j = 0; i < SIZE; ++i, j += 6) {
      const a = i * 2
      const b = a + 1
      const c = a + 2
      const d = a + 3
      indices[j + 0] = a
      indices[j + 1] = b
      indices[j + 2] = c
      indices[j + 3] = c
      indices[j + 4] = b
      indices[j + 5] = d
    }
    this.geometry.setIndex(new BufferAttribute(indices, 1))

    this.material = new MeshBasicNodeMaterial()
    this.material.blending = AdditiveBlending
  }

  private updateMaterial(): void {
    invariant(this.source != null)
    const { counts, limits } = this.source
    const channel = instanceIndex

    const limitRGBY = limits.element(int(0))
    const limit = max(limitRGBY.x, limitRGBY.y, limitRGBY.z, limitRGBY.w)

    const index = vertexIndex.div(2)
    const side = float(vertexIndex.mod(2))
    const x = float(index)
      .div(SIZE - 1)
      .sub(0.5)
    const top = float(counts.element(index).element(channel))
      .div(limit)
      .sub(0.5)
    const bottom = float(-0.5)
    const y = mix(top, bottom, side)

    const scaleX = screenSize.x.reciprocal().oneMinus()
    this.material.positionNode = vec3(x.mul(scaleX), y, 0)

    const color = Fn(() => {
      const color = vec3(0.1).toVar()
      color.element(channel).assign(0.5)
      return color.mul(0.5)
    })()

    this.material.colorNode = color.toVertexStage()
    this.material.needsUpdate = true
  }

  override onBeforeRender(): void {
    if (this.source == null) {
      return
    }

    if (this.source !== this.prevSource) {
      this.prevSource = this.source
      this.updateMaterial()
    }

    const size = this.source.size.value
    if (!size.equals(this.prevSize)) {
      this.prevSize.copy(size)
    }
  }

  dispose(): void {
    this.geometry.dispose()
    this.material.dispose()
  }
}
