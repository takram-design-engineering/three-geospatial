import { exp, max, nodeObject, vec3, vec4 } from 'three/tsl'

import { FnLayout, type Node } from '@takram/three-geospatial/webgpu'

import { REC709_LUMA_COEFFICIENTS } from './Rec709'

const vibranceFn = /*#__PURE__*/ FnLayout({
  name: 'vibrance',
  type: 'vec3',
  inputs: [
    { name: 'colorLinear', type: 'vec3' },
    { name: 'vibrance', type: 'float' }
  ]
})(([colorLinear, vibrance]) => {
  const r = colorLinear.r.sub(max(colorLinear.g, colorLinear.b))
  const s = vibrance
    .sub(1)
    .div(exp(r.mul(-3)).add(1))
    .add(1)
  const luma = s.oneMinus().mul(vec3(REC709_LUMA_COEFFICIENTS))
  return vec3(
    colorLinear.dot(luma.add(vec3(s, 0, 0))),
    colorLinear.dot(luma.add(vec3(0, s, 0))),
    colorLinear.dot(luma.add(vec3(0, 0, s)))
  )
})

export const vibrance = (
  colorLinear: Node,
  vibrance: number | Node<'float'>
): Node => {
  return vec4(vibranceFn(colorLinear.rgb, nodeObject(vibrance)), colorLinear.a)
}
