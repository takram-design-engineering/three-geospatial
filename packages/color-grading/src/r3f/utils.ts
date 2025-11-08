import { Rec709 } from '../Rec709'
import type { ColorTuple } from '../types'

// Reference: https://gist.github.com/mjackson/5311256
export function rgb2hsl(value: ColorTuple): ColorTuple {
  const [r, g, b] = value
  const min = Math.min(r, g, b)
  const max = Math.max(r, g, b)
  const l = (max + min) / 2
  let s
  let h = 0
  if (max === min) {
    s = h = 0
  } else {
    const d = max - min
    s = l < 0.5 ? d / (max + min) : d / (2 - max - min)
    if (r === max) {
      h = (g - b) / d
    } else if (g === max) {
      h = (b - r) / d + 2
    } else if (b === max) {
      h = (r - g) / d + 4
    }
    h *= 60
    if (h < 0) {
      h += 360
    }
  }
  return [h, s, l]
}

export function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) {
    t += 1
  }
  if (t > 1) {
    t -= 1
  }
  if (t < 1 / 6) {
    return p + (q - p) * 6 * t
  } else if (t < 1 / 2) {
    return q
  } else if (t < 2 / 3) {
    return p + (q - p) * (2 / 3 - t) * 6
  } else {
    return p
  }
}

// Reference: https://gist.github.com/mjackson/5311256
export function hsl2rgb(value: ColorTuple): ColorTuple {
  const [h, s, l] = value
  const H = h / 360
  let r, g, b
  if (s === 0) {
    r = g = b = l
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, H + 1 / 3)
    g = hue2rgb(p, q, H)
    b = hue2rgb(p, q, H - 1 / 3)
  }
  return [r, g, b]
}

export const chromaGradient = (): string => {
  const values = Array.from({ length: 16 }).map((_, index, { length }) => {
    const r = 2 * Math.PI * (0.25 - index / length)
    const color = Rec709.fromYCbCr(
      0.5,
      Math.cos(r) * 0.5,
      Math.sin(r) * 0.5
    ).toArray()
    const hsl = rgb2hsl(color as ColorTuple)
    const rgb = hsl2rgb([hsl[0], 1, 0.5])
    return rgb
  })
  values.push(values[0])
  return values
    .map(([r, g, b]) => `rgba(${r * 255} ${g * 255} ${b * 255} / 1)`)
    .join(',')
}
