import { add, sub, uniform, uv, vec3 } from 'three/tsl'
import { TempNode, type NodeBuilder, type TextureNode } from 'three/webgpu'
import invariant from 'tiny-invariant'

import { FnLayout } from './FnLayout'

export class LensGhostNode extends TempNode {
  static override get type(): string {
    return 'LensGhostNode'
  }

  inputNode?: TextureNode | null

  intensity = uniform(1e-5)

  constructor(inputNode?: TextureNode | null) {
    super('vec3')
    this.inputNode = inputNode
  }

  override setup(builder: NodeBuilder): unknown {
    const { inputNode, intensity } = this
    invariant(inputNode != null)

    const sampleGhost = FnLayout({
      name: 'sampleGhost',
      type: 'vec3',
      inputs: [
        { name: 'uv', type: 'vec2' },
        { name: 'direction', type: 'vec2' },
        { name: 'color', type: 'vec3' },
        { name: 'offset', type: 'float' }
      ]
    })(([uv, direction, color, offset]) => {
      const suv = direction.mul(offset).add(uv.oneMinus()).saturate()
      const result = inputNode.sample(suv).rgb.mul(color)

      // Falloff at the perimeter:
      const d = sub(0.5, suv)
        .length()
        .mul(1 / (Math.SQRT2 / 4))
        .saturate()
      result.mulAssign(d.oneMinus().pow(3))
      return result
    })

    const uvNode = uv()
    const direction = uvNode.sub(0.5)
    const color = add(
      sampleGhost(uvNode, direction, vec3(0.8, 0.8, 1), -5.0),
      sampleGhost(uvNode, direction, vec3(1, 0.8, 0.4), -1.5),
      sampleGhost(uvNode, direction, vec3(0.9, 1, 0.8), -0.4),
      sampleGhost(uvNode, direction, vec3(1, 0.8, 0.4), -0.2),
      sampleGhost(uvNode, direction, vec3(0.9, 0.7, 0.7), -0.1),
      sampleGhost(uvNode, direction, vec3(0.5, 1, 0.4), 0.7),
      sampleGhost(uvNode, direction, vec3(0.5, 0.5, 0.5), 1),
      sampleGhost(uvNode, direction, vec3(1, 1, 0.6), 2.5),
      sampleGhost(uvNode, direction, vec3(0.5, 0.8, 1), 10)
    )
    return color.mul(intensity)
  }
}
