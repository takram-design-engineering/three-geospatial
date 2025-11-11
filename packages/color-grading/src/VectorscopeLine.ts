import {
  AdditiveBlending,
  BufferAttribute,
  InstancedBufferGeometry,
  Line,
  Vector2
} from 'three'
import { instanceIndex, uniform, vec3, vertexIndex } from 'three/tsl'
import { LineBasicNodeMaterial, type NodeMaterial } from 'three/webgpu'
import invariant from 'tiny-invariant'

import { hsv2rgb, rgb2hsv } from '@takram/three-geospatial/webgpu'

import { linearToYCbCr } from './colors'
import type { RasterSource } from './RasterSource'

export const enum VectorscopeMode {
  NORMAL = 'normal',
  SCALED = 'scaled'
}

export class VectorscopeLine extends Line {
  declare geometry: InstancedBufferGeometry
  declare material: NodeMaterial

  source: RasterSource | null
  mode: VectorscopeMode

  gain = uniform(5)

  private prevSource?: RasterSource
  private prevMode?: VectorscopeMode
  private readonly prevSize = new Vector2()

  constructor(source?: RasterSource | null, mode = VectorscopeMode.NORMAL) {
    super()
    this.source = source ?? null
    this.mode = mode

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
    const { colors, size } = this.source
    const index = instanceIndex.mod(size.y).mul(size.x).add(vertexIndex)
    const color = colors.element(index)

    const liftedColor = hsv2rgb(vec3(rgb2hsv(color).xy, 1))
    const ycbcr = linearToYCbCr(color)

    this.material.positionNode =
      this.mode === VectorscopeMode.SCALED
        ? vec3(ycbcr.yz, 0).mul(4 / 3)
        : vec3(ycbcr.yz, 0)
    this.material.colorNode = liftedColor
      .div(size.y)
      .mul(this.gain)
      .toVertexStage()
    this.material.needsUpdate = true
  }

  override onBeforeRender(): void {
    if (this.source == null) {
      return
    }

    if (this.source !== this.prevSource || this.mode !== this.prevMode) {
      this.prevSource = this.source
      this.prevMode = this.mode
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
