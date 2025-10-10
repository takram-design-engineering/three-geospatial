// Ported from GLM: https://github.com/g-truc/glm/blob/master/glm/gtc/noise.inl

/**
 * OpenGL Mathematics (GLM)
 *
 * GLM is licensed under The Happy Bunny License or MIT License
 *
 * The Happy Bunny License (Modified MIT License)
 *
 * Copyright (c) 2005 - G-Truc Creation
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * Restrictions: By making use of the Software for military purposes, you choose
 * to make a Bunny unhappy.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * The MIT License
 *
 * Copyright (c) 2005 - G-Truc Creation
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { floor, mix, mul, step, sub, vec4 } from 'three/tsl'

import { FnLayout } from '@takram/three-geospatial/webgpu'

const mod289 = /*#__PURE__*/ FnLayout({
  name: 'mod289',
  type: 'vec4',
  inputs: [{ name: 'x', type: 'vec4' }]
})(([x]) => {
  return x.sub(floor(x.mul(1 / 289)).mul(289))
})

const permute = /*#__PURE__*/ FnLayout({
  name: 'permute',
  type: 'vec4',
  inputs: [{ name: 'v', type: 'vec4' }]
})(([v]) => {
  return mod289(v.mul(34).add(1).mul(v))
})

const taylorInvSqrt = /*#__PURE__*/ FnLayout({
  name: 'taylorInvSqrt',
  type: 'vec4',
  inputs: [{ name: 'r', type: 'vec4' }]
})(([r]) => {
  return sub(1.79284291400159, r.mul(0.85373472095314))
})

const fade = /*#__PURE__*/ FnLayout({
  name: 'fade',
  type: 'vec4',
  inputs: [{ name: 'v', type: 'vec4' }]
})(([v]) => {
  return v.pow3().mul(v.mul(v.mul(6).sub(15)).add(10))
})

// Classic Perlin noise, periodic version
export const periodicPerlinNoise = /*#__PURE__*/ FnLayout({
  name: 'periodicPerlinNoise',
  type: 'float',
  inputs: [
    { name: 'position', type: 'vec4' },
    { name: 'repeat', type: 'vec4' }
  ]
})(([position, repeat]) => {
  const Pi0 = position.floor().mod(repeat) // Integer part modulo repeat
  const Pi1 = Pi0.add(1).mod(repeat) // Integer part + 1 mod repeat
  const Pf0 = position.fract() // Fractional part for interpolation
  const Pf1 = Pf0.sub(1) // Fractional part - 1
  const ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x)
  const iy = vec4(Pi0.y, Pi0.y, Pi1.y, Pi1.y)
  const iz0 = vec4(Pi0.z)
  const iz1 = vec4(Pi1.z)
  const iw0 = vec4(Pi0.w)
  const iw1 = vec4(Pi1.w)

  const ixy = permute(permute(ix).add(iy))
  const ixy0 = permute(ixy.add(iz0))
  const ixy1 = permute(ixy.add(iz1))
  const ixy00 = permute(ixy0.add(iw0))
  const ixy01 = permute(ixy0.add(iw1))
  const ixy10 = permute(ixy1.add(iw0))
  const ixy11 = permute(ixy1.add(iw1))

  const gx00 = ixy00.div(7)
  const gy00 = gx00.floor().div(7)
  const gz00 = gy00.floor().div(6)
  gx00.assign(gx00.fract().sub(0.5))
  gy00.assign(gy00.fract().sub(0.5))
  gz00.assign(gz00.fract().sub(0.5))
  const gw00 = vec4(0.75).sub(gx00.abs()).sub(gy00.abs()).sub(gz00.abs())
  const sw00 = step(gw00, 0)
  gx00.subAssign(sw00.mul(step(0, gx00).sub(0.5)))
  gy00.subAssign(sw00.mul(step(0, gy00).sub(0.5)))

  const gx01 = ixy01.div(7)
  const gy01 = gx01.floor().div(7)
  const gz01 = gy01.floor().div(6)
  gx01.assign(gx01.fract().sub(0.5))
  gy01.assign(gy01.fract().sub(0.5))
  gz01.assign(gz01.fract().sub(0.5))
  const gw01 = vec4(0.75).sub(gx01.abs()).sub(gy01.abs()).sub(gz01.abs())
  const sw01 = step(gw01, 0)
  gx01.subAssign(sw01.mul(step(0, gx01).sub(0.5)))
  gy01.subAssign(sw01.mul(step(0, gy01).sub(0.5)))

  const gx10 = ixy10.div(7)
  const gy10 = gx10.floor().div(7)
  const gz10 = gy10.floor().div(6)
  gx10.assign(gx10.fract().sub(0.5))
  gy10.assign(gy10.fract().sub(0.5))
  gz10.assign(gz10.fract().sub(0.5))
  const gw10 = vec4(0.75).sub(gx10.abs()).sub(gy10.abs()).sub(gz10.abs())
  const sw10 = step(gw10, 0)
  gx10.subAssign(sw10.mul(step(0, gx10).sub(0.5)))
  gy10.subAssign(sw10.mul(step(0, gy10).sub(0.5)))

  const gx11 = ixy11.div(7)
  const gy11 = gx11.floor().div(7)
  const gz11 = gy11.floor().div(6)
  gx11.assign(gx11.fract().sub(0.5))
  gy11.assign(gy11.fract().sub(0.5))
  gz11.assign(gz11.fract().sub(0.5))
  const gw11 = vec4(0.75).sub(gx11.abs()).sub(gy11.abs()).sub(gz11.abs())
  const sw11 = step(gw11, 0)
  gx11.subAssign(sw11.mul(step(0, gx11).sub(0.5)))
  gy11.subAssign(sw11.mul(step(0, gy11).sub(0.5)))

  const g0000 = vec4(gx00.x, gy00.x, gz00.x, gw00.x)
  const g1000 = vec4(gx00.y, gy00.y, gz00.y, gw00.y)
  const g0100 = vec4(gx00.z, gy00.z, gz00.z, gw00.z)
  const g1100 = vec4(gx00.w, gy00.w, gz00.w, gw00.w)
  const g0010 = vec4(gx10.x, gy10.x, gz10.x, gw10.x)
  const g1010 = vec4(gx10.y, gy10.y, gz10.y, gw10.y)
  const g0110 = vec4(gx10.z, gy10.z, gz10.z, gw10.z)
  const g1110 = vec4(gx10.w, gy10.w, gz10.w, gw10.w)
  const g0001 = vec4(gx01.x, gy01.x, gz01.x, gw01.x)
  const g1001 = vec4(gx01.y, gy01.y, gz01.y, gw01.y)
  const g0101 = vec4(gx01.z, gy01.z, gz01.z, gw01.z)
  const g1101 = vec4(gx01.w, gy01.w, gz01.w, gw01.w)
  const g0011 = vec4(gx11.x, gy11.x, gz11.x, gw11.x)
  const g1011 = vec4(gx11.y, gy11.y, gz11.y, gw11.y)
  const g0111 = vec4(gx11.z, gy11.z, gz11.z, gw11.z)
  const g1111 = vec4(gx11.w, gy11.w, gz11.w, gw11.w)

  const norm00 = taylorInvSqrt(
    vec4(g0000.dot(g0000), g0100.dot(g0100), g1000.dot(g1000), g1100.dot(g1100))
  )
  g0000.mulAssign(norm00.x)
  g0100.mulAssign(norm00.y)
  g1000.mulAssign(norm00.z)
  g1100.mulAssign(norm00.w)

  const norm01 = taylorInvSqrt(
    vec4(g0001.dot(g0001), g0101.dot(g0101), g1001.dot(g1001), g1101.dot(g1101))
  )
  g0001.mulAssign(norm01.x)
  g0101.mulAssign(norm01.y)
  g1001.mulAssign(norm01.z)
  g1101.mulAssign(norm01.w)

  const norm10 = taylorInvSqrt(
    vec4(g0010.dot(g0010), g0110.dot(g0110), g1010.dot(g1010), g1110.dot(g1110))
  )
  g0010.mulAssign(norm10.x)
  g0110.mulAssign(norm10.y)
  g1010.mulAssign(norm10.z)
  g1110.mulAssign(norm10.w)

  const norm11 = taylorInvSqrt(
    vec4(g0011.dot(g0011), g0111.dot(g0111), g1011.dot(g1011), g1111.dot(g1111))
  )
  g0011.mulAssign(norm11.x)
  g0111.mulAssign(norm11.y)
  g1011.mulAssign(norm11.z)
  g1111.mulAssign(norm11.w)

  const n0000 = g0000.dot(Pf0)
  const n1000 = g1000.dot(vec4(Pf1.x, Pf0.y, Pf0.z, Pf0.w))
  const n0100 = g0100.dot(vec4(Pf0.x, Pf1.y, Pf0.z, Pf0.w))
  const n1100 = g1100.dot(vec4(Pf1.x, Pf1.y, Pf0.z, Pf0.w))
  const n0010 = g0010.dot(vec4(Pf0.x, Pf0.y, Pf1.z, Pf0.w))
  const n1010 = g1010.dot(vec4(Pf1.x, Pf0.y, Pf1.z, Pf0.w))
  const n0110 = g0110.dot(vec4(Pf0.x, Pf1.y, Pf1.z, Pf0.w))
  const n1110 = g1110.dot(vec4(Pf1.x, Pf1.y, Pf1.z, Pf0.w))
  const n0001 = g0001.dot(vec4(Pf0.x, Pf0.y, Pf0.z, Pf1.w))
  const n1001 = g1001.dot(vec4(Pf1.x, Pf0.y, Pf0.z, Pf1.w))
  const n0101 = g0101.dot(vec4(Pf0.x, Pf1.y, Pf0.z, Pf1.w))
  const n1101 = g1101.dot(vec4(Pf1.x, Pf1.y, Pf0.z, Pf1.w))
  const n0011 = g0011.dot(vec4(Pf0.x, Pf0.y, Pf1.z, Pf1.w))
  const n1011 = g1011.dot(vec4(Pf1.x, Pf0.y, Pf1.z, Pf1.w))
  const n0111 = g0111.dot(vec4(Pf0.x, Pf1.y, Pf1.z, Pf1.w))
  const n1111 = g1111.dot(Pf1)

  const fadeXYZW = fade(Pf0)
  const n0W = mix(
    vec4(n0000, n1000, n0100, n1100),
    vec4(n0001, n1001, n0101, n1101),
    fadeXYZW.w
  )
  const n1W = mix(
    vec4(n0010, n1010, n0110, n1110),
    vec4(n0011, n1011, n0111, n1111),
    fadeXYZW.w
  )
  const nZW = mix(n0W, n1W, fadeXYZW.z)
  const nYZW = mix(nZW.xy, nZW.zw, fadeXYZW.y)
  const nXYZW = mix(nYZW.x, nYZW.y, fadeXYZW.x)
  return mul(2.2, nXYZW)
})
