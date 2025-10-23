import {
  AdditiveBlending,
  BufferAttribute,
  InstancedBufferGeometry,
  Line,
  Vector2
} from 'three'
import {
  instanceIndex,
  screenSize,
  select,
  uniform,
  vec2,
  vec3,
  vertexIndex
} from 'three/tsl'
import {
  LineBasicNodeMaterial,
  type NodeMaterial,
  type Renderer
} from 'three/webgpu'
import invariant from 'tiny-invariant'

import {
  hsv2rgb,
  linearToRec709,
  linearToRec709YCbCr,
  rgb2hsv,
  type NodeObject
} from '@takram/three-geospatial/webgpu'

import type { VideoAnalysis } from './VideoAnalysis'

const modes = {
  luma: { components: 1 },
  cb: { components: 1 },
  cr: { components: 1 },
  red: { components: 1 },
  green: { components: 1 },
  blue: { components: 1 },
  rgb: { components: 3 }
} satisfies Record<string, { components: number }>

export type WaveformMode = keyof typeof modes

export class Waveform extends Line {
  declare geometry: InstancedBufferGeometry
  declare material: NodeMaterial

  source: VideoAnalysis | null
  mode: WaveformMode

  gain = uniform(5)

  private prevSource: VideoAnalysis | null = null
  private prevMode?: WaveformMode
  private prevComponents?: number
  private readonly prevSize = new Vector2()

  constructor(source?: VideoAnalysis | null, mode: WaveformMode = 'luma') {
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
    const { colorBuffer, uvBuffer, size } = this.source
    const index = instanceIndex.mod(size.y).mul(size.x).add(vertexIndex)
    const channel = instanceIndex.div(size.y)
    const linearColor = colorBuffer.element(index)
    const nonlinearColor = linearToRec709(linearColor)
    const uv = uvBuffer.element(index)

    let color: NodeObject<'vec3'>
    let y: NodeObject<'float'>
    switch (this.mode) {
      case 'luma':
        color = hsv2rgb(vec3(rgb2hsv(linearColor).xy, 1))
        y = linearToRec709YCbCr(linearColor).x
        break
      case 'cb':
        color = vec3(1, 1, 0.25)
        y = linearToRec709YCbCr(linearColor).y.add(0.5)
        break
      case 'cr':
        color = vec3(1, 0.25, 1)
        y = linearToRec709YCbCr(linearColor).z.add(0.5)
        break
      case 'red':
        color = vec3(1, 0.25, 0.25)
        y = nonlinearColor.r
        break
      case 'green':
        color = vec3(0.25, 1, 0.25)
        y = nonlinearColor.g
        break
      case 'blue':
        color = vec3(0.25, 0.25, 1)
        y = nonlinearColor.b
        break
      case 'rgb':
        color = select(
          channel.equal(0),
          vec3(1, 0.25, 0.25),
          select(
            channel.equal(1),
            vec3(0.25, 1, 0.25),
            select(channel.equal(2), vec3(0.25, 0.25, 1), 0)
          )
        )
        y = select(
          channel.equal(0),
          nonlinearColor.r,
          select(
            channel.equal(1),
            nonlinearColor.g,
            select(channel.equal(2), nonlinearColor.b, 0)
          )
        )
        break
    }

    const scaleY = screenSize.y.reciprocal().oneMinus()
    this.material.positionNode = vec3(vec2(uv.x, y.mul(scaleY)).sub(0.5))
    this.material.colorNode = color.div(size.y).mul(this.gain).toVertexStage()
    this.material.needsUpdate = true
  }

  override onBeforeRender(renderer: unknown): void {
    if (this.source == null) {
      return
    }
    this.source.update(renderer as Renderer)

    if (this.source !== this.prevSource || this.mode !== this.prevMode) {
      this.prevSource = this.source
      this.prevMode = this.mode
      this.updateMaterial()
    }

    const size = this.source.size.value
    const components = modes[this.mode].components
    if (!size.equals(this.prevSize) || components !== this.prevComponents) {
      this.prevSize.copy(size)
      this.prevComponents = components
      this.geometry.setAttribute(
        'position',
        new BufferAttribute(new Float32Array(size.x * 3), 3)
      )
      this.geometry.instanceCount = size.y * components
    }
  }

  dispose(): void {
    this.geometry.dispose()
    this.material.dispose()
  }
}
