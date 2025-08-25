import {
  abs,
  equirectUV,
  fwidth,
  mix,
  rand,
  screenCoordinate,
  smoothstep,
  vec2,
  vec3
} from 'three/tsl'

import type { NodeObject } from './node'

export const dithering = (): NodeObject<'vec3' | 'vec4'> => {
  const gridPosition = rand(screenCoordinate.xy)
  const ditherShift = vec3(0.25, -0.25, 0.25).div(255).toConst()
  return mix(ditherShift.mul(2), ditherShift.mul(-2), gridPosition)
}

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
