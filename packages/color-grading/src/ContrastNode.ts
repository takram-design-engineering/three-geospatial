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
    { name: 'colorLinear', type: 'vec3' },
    { name: 'contrast', type: 'float' }
  ]
})(([colorLinear, contrast]) => {
  return colorLinear
    .sub(ACEScc_MIDDLE_GRAY)
    .mul(contrast)
    .add(ACEScc_MIDDLE_GRAY)
})

export class ContrastNode extends TempNode {
  colorLinear: Node
  contrast: Node<'float'>

  constructor(color: Node, contrast: number | Node<'float'>) {
    super('vec4')
    this.colorLinear = color
    this.contrast = nodeObject(contrast)
  }

  override setup(builder: NodeBuilder): unknown {
    const colorLogC = linearToLogC(this.colorLinear.rgb)
    return vec4(
      logCToLinear(contrastFn(colorLogC, this.contrast)),
      this.colorLinear.a
    )
  }
}

export const contrast = (
  ...args: ConstructorParameters<typeof ContrastNode>
): ContrastNode => new ContrastNode(...args)
