import {
  AdditiveBlending,
  BufferAttribute,
  InstancedBufferGeometry,
  Line,
  Vector2
} from 'three'
import {
  Fn,
  instanceIndex,
  screenSize,
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
  rgb2hsv,
  type NodeObject
} from '@takram/three-geospatial/webgpu'

import { linearToRec709, linearToRec709YCbCr } from './colors'
import type { RasterTransform } from './RasterTransform'

interface Mode {
  components: number
  color: (
    color: NodeObject<'vec3'>,
    channel: NodeObject<'uint'>
  ) => NodeObject<'vec3'>
  y: (
    color: NodeObject<'vec3'>,
    channel: NodeObject<'uint'>
  ) => NodeObject<'float'>
}

const modes = {
  luma: {
    components: 1,
    color: color => hsv2rgb(vec3(rgb2hsv(color).xy, 1)),
    y: color => linearToRec709YCbCr(color).x
  },
  cb: {
    components: 1,
    color: () => vec3(1, 1, 0.25),
    y: color => linearToRec709YCbCr(color).y.add(0.5)
  },
  cr: {
    components: 1,
    color: () => vec3(1, 0.25, 1),
    y: color => linearToRec709YCbCr(color).z.add(0.5)
  },
  red: {
    components: 1,
    color: () => vec3(1, 0.25, 0.25),
    y: color => linearToRec709(color).r
  },
  green: {
    components: 1,
    color: () => vec3(0.25, 1, 0.25),
    y: color => linearToRec709(color).g
  },
  blue: {
    components: 1,
    color: () => vec3(0.25, 0.25, 1),
    y: color => linearToRec709(color).b
  },
  rgb: {
    components: 3,
    color: (_, channel) =>
      Fn(() => {
        const color = vec3(0.25).toVar()
        color.element(channel).assign(1)
        return color
      })(),
    y: (color, channel) => linearToRec709(color).element(channel)
  }
} satisfies Record<string, Mode>

export type WaveformMode = keyof typeof modes

export class WaveformLine extends Line {
  declare geometry: InstancedBufferGeometry
  declare material: NodeMaterial

  source: RasterTransform | null
  mode: WaveformMode

  gain = uniform(5)

  private prevSource?: RasterTransform
  private prevVersion?: number
  private prevMode?: WaveformMode
  private prevComponents?: number
  private readonly prevSize = new Vector2()

  constructor(source?: RasterTransform | null, mode: WaveformMode = 'luma') {
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
    const uv = uvBuffer.element(index)

    const mode = modes[this.mode]
    const color = mode.color(linearColor, channel)
    const y = mode.y(linearColor, channel)

    const scaleY = screenSize.y.reciprocal().oneMinus()
    this.material.positionNode = vec3(vec2(uv.x, y.mul(scaleY)).sub(0.5))
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
      this.source.version !== this.prevVersion ||
      this.mode !== this.prevMode
    ) {
      this.prevSource = this.source
      this.prevVersion = this.source.version
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
