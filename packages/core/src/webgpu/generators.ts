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

import type { NodeObject } from './node'

// Reference: https://advances.realtimerendering.com/s2014/index.html
export const interleavedGradientNoise = (
  seed: NodeObject<'vec2'>
): NodeObject<'float'> => {
  const magic = vec3(0.06711056, 0.00583715, 52.9829189)
  return magic.z.mul(seed.dot(magic.xy).fract()).fract()
}

// Reference (sixth from the bottom): https://www.shadertoy.com/view/MslGR8
export const dithering: NodeObject<'vec3'> = /*#__PURE__*/ Fn(() => {
  const seed = vec2(screenCoordinate.xy).add(time.fract().mul(1337))
  const noise = interleavedGradientNoise(seed)
  return vec3(noise, noise.oneMinus(), noise).sub(0.5).div(255)
}).once()()

export const equirectGrid = (
  direction: NodeObject<'vec3'>,
  lineWidth: NodeObject<'float'>,
  count: NodeObject<'vec2'> = vec2(90, 45)
): NodeObject<'float'> => {
  const uv = equirectUV(direction)
  const deltaUV = fwidth(uv)
  const width = lineWidth.mul(deltaUV).mul(0.5)
  const distance = abs(uv.mul(count).fract().sub(0.5)).div(count)
  const mask = smoothstep(width, width.add(deltaUV), distance).oneMinus()
  return mask.x.add(mask.y).clamp(0, 1)
}
