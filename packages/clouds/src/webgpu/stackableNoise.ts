// Based on the following work with slight modifications.
// https://github.com/sebh/TileableVolumeNoise

/**
 * The MIT License (MIT)
 *
 * Copyright(c) 2017 Sébastien Hillaire
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

import { float, Loop, min, mix, sin, sub, vec3, vec4 } from 'three/tsl'

import { FnLayout } from '@takram/three-geospatial/webgpu'

import { periodicPerlinNoise } from './perlinNoise'

const hash = /*#__PURE__*/ FnLayout({
  name: 'hash',
  type: 'float',
  inputs: [{ name: 'n', type: 'float' }]
})(([n]) => {
  return sin(n.add(1.951)).mul(43758.5453).fract()
})

const noise = /*#__PURE__*/ FnLayout({
  name: 'noise',
  type: 'float',
  inputs: [{ name: 'x', type: 'vec3' }]
})(([x]) => {
  const p = x.floor().toVar()
  const f = x.fract().toVar()

  f.assign(f.pow2().mul(sub(3, f.mul(2))))
  const n = p.x.add(p.y.mul(57)).add(p.z.mul(113)).toVar()
  return mix(
    mix(
      mix(hash(n), hash(n.add(1)), f.x),
      mix(hash(n.add(57)), hash(n.add(58)), f.x),
      f.y
    ),
    mix(
      mix(hash(n.add(113)), hash(n.add(114)), f.x),
      mix(hash(n.add(170)), hash(n.add(171)), f.x),
      f.y
    ),
    f.z
  )
})

export const stackableWorleyNoise = /*#__PURE__*/ FnLayout({
  name: 'stackableWorleyNoise',
  type: 'float',
  inputs: [
    { name: 'p', type: 'vec3' },
    { name: 'cellCount', type: 'float' }
  ]
})(([p, cellCount]) => {
  const cell = p.mul(cellCount).toVar()
  const d = float(1.0e10).toVar()
  // @ts-expect-error Missing type
  Loop({ start: -1, end: 1, condition: '<=', name: 'x' }, ({ x }) => {
    // @ts-expect-error Missing type
    Loop({ start: -1, end: 1, condition: '<=', name: 'y' }, ({ y }) => {
      // @ts-expect-error Missing type
      Loop({ start: -1, end: 1, condition: '<=', name: 'z' }, ({ z }) => {
        const tp = cell
          .floor()
          .add(vec3(x, y, z))
          .toVar()
        tp.assign(cell.sub(tp).sub(noise(tp.mod(cellCount))))
        d.assign(min(d, tp.dot(tp)))
      })
    })
  })
  return d.saturate()
})

export const stackablePerlinNoise = /*#__PURE__*/ FnLayout({
  name: 'stackablePerlinNoise',
  type: 'float',
  inputs: [
    { name: 'point', type: 'vec3' },
    { name: 'frequency', type: 'vec3' },
    { name: 'octaveCount', type: 'int' }
  ]
})(([point, frequency, octaveCount]) => {
  // Noise frequency factor between octave, forced to 2.
  const octaveFrequencyFactor = 2

  // Compute the sum for each octave.
  const sum = float(0).toVar()
  const roughness = float(0.5).toVar()
  const weightSum = float(0).toVar()
  const weight = float(1).toVar()
  const nextFrequency = frequency.toVar()
  Loop({ start: 0, end: octaveCount }, () => {
    const p = vec4(point.x, point.y, point.z, 0).mul(vec4(nextFrequency, 1))
    const value = periodicPerlinNoise(p, vec4(nextFrequency, 1)).toVar()
    sum.addAssign(value.mul(weight))
    weightSum.addAssign(weight)
    weight.mulAssign(roughness)
    nextFrequency.mulAssign(octaveFrequencyFactor)
  })

  return sum.div(weightSum)
})
