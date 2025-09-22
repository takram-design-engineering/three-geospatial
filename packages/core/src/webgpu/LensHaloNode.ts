import { Vector2 } from 'three'
import {
  abs,
  distance,
  fract,
  min,
  mul,
  sub,
  uniform,
  uv,
  vec2,
  vec3
} from 'three/tsl'
import {
  NodeUpdateType,
  TempNode,
  type NodeBuilder,
  type NodeFrame,
  type TextureNode
} from 'three/webgpu'
import invariant from 'tiny-invariant'

import { FnLayout } from './FnLayout'

const sizeScratch = /*#__PURE__*/ new Vector2()

export class LensHaloNode extends TempNode {
  static override get type(): string {
    return 'LensHaloNode'
  }

  inputNode?: TextureNode | null

  intensity = uniform(1e-5)
  chromaticAberration = uniform(0.005)

  private readonly aspectRatio = uniform(0)

  constructor(inputNode?: TextureNode | null) {
    super('vec3')
    this.inputNode = inputNode
    this.updateBeforeType = NodeUpdateType.FRAME
  }

  override updateBefore({ renderer }: NodeFrame): void {
    if (renderer == null) {
      return
    }
    const { width, height } = renderer.getDrawingBufferSize(sizeScratch)
    this.aspectRatio.value = width / height
  }

  override setup(builder: NodeBuilder): unknown {
    const { inputNode, intensity, chromaticAberration, aspectRatio } = this
    invariant(inputNode != null)

    const cubicRingMask = FnLayout({
      name: 'cubicRingMask',
      type: 'float',
      inputs: [
        { name: 'x', type: 'float' },
        { name: 'radius', type: 'float' },
        { name: 'thickness', type: 'float' }
      ]
    })(([x, radius, thickness]) => {
      const v = min(abs(x.sub(radius)).div(thickness), 1)
      return mul(v, v, sub(3, v.mul(2))).oneMinus()
    })

    const sampleHalo = FnLayout({
      name: 'sampleHalo',
      type: 'vec3',
      inputs: [
        { name: 'uv', type: 'vec2' },
        { name: 'radius', type: 'float' }
      ]
    })(([uv, radius]) => {
      const scale = vec2(aspectRatio, 1)
      const direction = uv.sub(0.5).mul(scale).normalize().div(scale)
      const offset = vec3(chromaticAberration).mul(vec3(-1, 0, 1))
      const suv = fract(direction.mul(radius).add(uv.oneMinus()))
      const result = vec3(
        inputNode.sample(direction.mul(offset.r).add(suv)).r,
        inputNode.sample(direction.mul(offset.g).add(suv)).g,
        inputNode.sample(direction.mul(offset.b).add(suv)).b
      )

      // Falloff at the center and perimeter:
      const wuv = uv.sub(vec2(0.5, 0)).mul(scale).add(vec2(0.5, 0))
      const d = distance(wuv, vec2(0.5)).saturate()
      result.mulAssign(cubicRingMask(d, 0.45, 0.25))
      return result
    })

    const uvNode = uv()
    const color = sampleHalo(uvNode, 0.3)
    return color.mul(intensity)
  }
}
