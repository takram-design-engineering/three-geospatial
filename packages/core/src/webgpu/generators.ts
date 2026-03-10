import {
  abs,
  equirectUV,
  Fn,
  fwidth,
  screenCoordinate,
  smoothstep,
  time,
  vec2,
  vec3
} from 'three/tsl'

import type { Node } from './node'

// Reference: https://advances.realtimerendering.com/s2014/index.html
export const interleavedGradientNoise = (seed: Node<'vec2'>): Node<'float'> => {
  return seed.dot(vec2(0.06711056, 0.00583715)).fract().mul(52.9829189).fract()
}

// Reference (sixth from the bottom): https://www.shadertoy.com/view/MslGR8
export const dithering: Node<'vec3'> = /*#__PURE__*/ Fn(() => {
  const seed = vec2(screenCoordinate.xy).add(time.fract().mul(1337))
  const noise = interleavedGradientNoise(seed)
  return vec3(noise, noise.oneMinus(), noise).sub(0.5).div(255)
}).once()()

export const equirectGrid = (
  direction: Node<'vec3'>,
  lineWidth: Node<'float'>,
  count: Node<'vec2'> = vec2(90, 45)
): Node<'float'> => {
  const uv = equirectUV(direction)
  const deltaUV = fwidth(uv)
  const width = lineWidth.mul(deltaUV).mul(0.5)
  const distance = abs(uv.mul(count).fract().sub(0.5)).div(count)
  const mask = smoothstep(width, width.add(deltaUV), distance).oneMinus()
  return mask.x.add(mask.y).clamp(0, 1)
}
