import { nodeObject, vec3, vec4 } from 'three/tsl'

import { FnLayout, type Node } from '@takram/three-geospatial/webgpu'

import { REC709_LUMA_COEFFICIENTS } from './Rec709'

const saturationFn = /*#__PURE__*/ FnLayout({
  name: 'saturation',
  type: 'vec3',
  inputs: [
    { name: 'colorLinear', type: 'vec3' },
    { name: 'vibrance', type: 'float' }
  ]
})(([colorLinear, saturation]) => {
  const luma = colorLinear.dot(vec3(REC709_LUMA_COEFFICIENTS))
  return luma.add(saturation.mul(colorLinear.sub(luma)))
})

export const saturation = (
  colorLinear: Node,
  saturation: number | Node<'float'>
): Node => {
  return vec4(
    saturationFn(colorLinear.rgb, nodeObject(saturation)),
    colorLinear.a
  )
}
