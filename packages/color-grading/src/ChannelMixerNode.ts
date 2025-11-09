import { vec3, vec4 } from 'three/tsl'

import { FnLayout, type Node } from '@takram/three-geospatial/webgpu'

const channelMixerFn = /*#__PURE__*/ FnLayout({
  name: 'channelMixer',
  type: 'vec3',
  inputs: [
    { name: 'colorLinear', type: 'vec3' },
    { name: 'r', type: 'vec3' },
    { name: 'g', type: 'vec3' },
    { name: 'b', type: 'vec3' }
  ]
})(([colorLinear, r, g, b]) => {
  return vec3(colorLinear.dot(r), colorLinear.dot(g), colorLinear.dot(b))
})

export const channelMixer = (
  colorLinear: Node,
  r: Node<'vec3'>,
  g: Node<'vec3'>,
  b: Node<'vec3'>
): Node => {
  return vec4(channelMixerFn(colorLinear.rgb, r, g, b), colorLinear.a)
}
