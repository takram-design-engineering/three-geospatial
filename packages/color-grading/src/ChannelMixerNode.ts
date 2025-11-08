import { vec3, vec4 } from 'three/tsl'

import { FnLayout, type Node } from '@takram/three-geospatial/webgpu'

const channelMixerFn = /*#__PURE__*/ FnLayout({
  name: 'channelMixer',
  type: 'vec3',
  inputs: [
    { name: 'input', type: 'vec3' },
    { name: 'r', type: 'vec3' },
    { name: 'g', type: 'vec3' },
    { name: 'b', type: 'vec3' }
  ]
})(([input, r, g, b]) => {
  return vec3(input.dot(r), input.dot(g), input.dot(b))
})

export const channelMixer = (
  inputNode: Node,
  r: Node<'vec3'>,
  g: Node<'vec3'>,
  b: Node<'vec3'>
): Node => {
  return vec4(channelMixerFn(inputNode.rgb, r, g, b), inputNode.a)
}
