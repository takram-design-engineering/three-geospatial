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
import { instanceIndex, luminance, vec2, vec3, vertexIndex } from 'three/tsl'
import {
  LineBasicNodeMaterial,
  type NodeMaterial,
  type Renderer
} from 'three/webgpu'
import invariant from 'tiny-invariant'

import {
  hsv2rgb,
  rgb2hsv,
  type NodeObject
} from '@takram/three-geospatial/webgpu'

import type { VideoAnalysis } from './VideoAnalysis'

export type VideoWaveformMode = 'luma' | 'red' | 'green' | 'blue'

export class VideoWaveform extends Line {
  declare geometry: InstancedBufferGeometry
  declare material: NodeMaterial

  source?: VideoAnalysis | null
  mode: VideoWaveformMode

  private prevMode?: VideoWaveformMode
  private readonly prevSize = new Vector2()

  constructor(source?: VideoAnalysis | null, mode: VideoWaveformMode = 'luma') {
    super()
    this.source = source
    this.mode = mode

    this.geometry = new InstancedBufferGeometry()
    this.geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array(3), 3)
    )

    this.material = new LineBasicNodeMaterial()
    this.material.transparent = true
    this.material.opacity = 0.05
    this.material.blending = AdditiveBlending
  }

  private updateMaterial(): void {
    invariant(this.source != null)
    const { colorBuffer, uvBuffer, size } = this.source
    const index = instanceIndex.mul(size.x).add(vertexIndex)
    const inputColor = colorBuffer.element(index)
    const inputUV = uvBuffer.element(index)

    let color: NodeObject<'vec3'>
    let y: NodeObject<'float'>
    switch (this.mode) {
      case 'luma':
        color = hsv2rgb(vec3(rgb2hsv(inputColor).xy, 1))
        y = luminance(inputColor)
        break
      case 'red':
        color = vec3(1, 0.5, 0.5)
        y = inputColor.r
        break
      case 'green':
        color = vec3(0.5, 1, 0.5)
        y = inputColor.g
        break
      case 'blue':
        color = vec3(0.5, 0.5, 1)
        y = inputColor.b
        break
    }

    this.material.positionNode = vec3(vec2(inputUV.x, y).sub(0.5))
    this.material.colorNode = color.toVertexStage()
  }

  override onBeforeRender(
    renderer: unknown,
    scene: Scene,
    camera: Camera,
    geometry: BufferGeometry,
    material: Material,
    group: Group
  ): void {
    if (this.source == null) {
      return
    }
    this.source.update(renderer as Renderer)

    if (this.mode !== this.prevMode) {
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
