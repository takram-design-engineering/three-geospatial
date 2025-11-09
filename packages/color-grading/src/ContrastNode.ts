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
    { name: 'color', type: 'vec3' },
    { name: 'contrast', type: 'float' }
  ]
})(([color, contrast]) => {
  return color.sub(ACEScc_MIDDLE_GRAY).mul(contrast).add(ACEScc_MIDDLE_GRAY)
})

export class ContrastNode extends TempNode {
  inputNode: Node
  contrast: Node<'float'>

  constructor(color: Node, contrast: number | Node<'float'>) {
    super('vec4')
    this.inputNode = color
    this.contrast = nodeObject(contrast)
  }

  override setup(builder: NodeBuilder): unknown {
    const colorLogC = linearToLogC(this.inputNode.rgb)
    return vec4(
      logCToLinear(contrastFn(colorLogC, this.contrast)),
      this.inputNode.a
    )
  }
}

export const contrast = (
  ...args: ConstructorParameters<typeof ContrastNode>
): ContrastNode => new ContrastNode(...args)
