import { nodeObject, vec3, vec4 } from 'three/tsl'

import { FnLayout, type Node } from '@takram/three-geospatial/webgpu'

import { REC709_LUMA_COEFFICIENTS } from './Rec709'

const saturationFn = /*#__PURE__*/ FnLayout({
  name: 'saturation',
  type: 'vec3',
  inputs: [
    { name: 'input', type: 'vec3' },
    { name: 'vibrance', type: 'float' }
  ]
})(([input, saturation]) => {
  const y = input.dot(vec3(REC709_LUMA_COEFFICIENTS))
  return y.add(saturation.mul(input.sub(y)))
})

export const saturation = (
  inputNode: Node,
  saturation: number | Node<'float'>
): Node => {
  return vec4(saturationFn(inputNode.rgb, nodeObject(saturation)), inputNode.a)
}
