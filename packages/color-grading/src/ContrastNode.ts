import { hash } from 'three/src/nodes/core/NodeUtils.js'
import { nodeObject, vec4 } from 'three/tsl'
import { TempNode, type NodeBuilder } from 'three/webgpu'

import { FnLayout, type Node } from '@takram/three-geospatial/webgpu'

import { linearToLogC, logCToLinear } from './colors'

// eslint-disable-next-line @typescript-eslint/naming-convention
const ACEScc_MIDDLE_GRAY = 0.4135884

const contrastFn = /*#__PURE__*/ FnLayout({
  name: 'contrast',
  type: 'vec3',
  inputs: [
    { name: 'input', type: 'vec3' },
    { name: 'contrast', type: 'float' }
  ]
})(([input, contrast]) => {
  return input.sub(ACEScc_MIDDLE_GRAY).mul(contrast).add(ACEScc_MIDDLE_GRAY)
})

export class ContrastNode extends TempNode {
  inputNode: Node
  contrast: Node<'float'>

  inputLogC = false

  constructor(inputNode: Node, contrast: number | Node<'float'>) {
    super('vec4')
    this.inputNode = inputNode
    this.contrast = nodeObject(contrast)
  }

  override customCacheKey(): number {
    return hash(+this.inputLogC)
  }

  override setup(builder: NodeBuilder): unknown {
    const inputColor = this.inputLogC
      ? this.inputNode.rgb
      : linearToLogC(this.inputNode.rgb)
    const output = contrastFn(inputColor, this.contrast)
    return vec4(
      this.inputLogC ? output : logCToLinear(output),
      this.inputNode.a
    )
  }
}

export const contrast = (
  ...args: ConstructorParameters<typeof ContrastNode>
): ContrastNode => new ContrastNode(...args)
