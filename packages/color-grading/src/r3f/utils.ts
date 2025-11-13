import {
  createElement,
  type ComponentPropsWithoutRef,
  type ComponentPropsWithRef,
  type FC,
  type HTMLElementType
} from 'react'

import { Rec709 } from '../Rec709'
import type { ColorTuple } from '../types'

export function styled<T extends HTMLElementType>(
  tag: T,
  className: string,
  defaultProps?: ComponentPropsWithoutRef<T>
): FC<ComponentPropsWithRef<T>> {
  return ({ children, ...props }) =>
    createElement(
      tag,
      {
        ...defaultProps,
        ...props,
        ...(props.className != null
          ? { className: `${className} ${props.className}` }
          : { className })
      },
      children
    )
}

export function styledProps<P extends ComponentPropsWithRef<HTMLElementType>>(
  className: string,
  props: P
): P & { className: string } {
  return {
    ...props,
    ...(props.className != null
      ? { className: `${className} ${props.className}` }
      : { className })
  }
}

// Reference: https://gist.github.com/mjackson/5311256
export function rgb2hsv(value: ColorTuple): ColorTuple {
  const [r, g, b] = value
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  const v = max
  const s = max === 0 ? 0 : d / max
  let h = 0

  if (max !== min) {
    if (r === max) {
      h = (g - b) / d + (g < b ? 6 : 0)
    } else if (g === max) {
      h = (b - r) / d + 2
    } else if (b === max) {
      h = (r - g) / d + 4
    }
    h /= 6
  }

  return [h * 360, s, v]
}

// Reference: https://gist.github.com/mjackson/5311256
export function hsv2rgb(value: ColorTuple): ColorTuple {
  const [h, s, v] = value
  const H = h / 360
  const i = Math.floor(H * 6)
  const f = H * 6 - i
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)
  switch (i % 6) {
    case 0:
      return [v, t, p]
    case 1:
      return [q, v, p]
    case 2:
      return [p, v, t]
    case 3:
      return [p, q, v]
    case 4:
      return [t, p, v]
    case 5:
      return [v, p, q]
    default:
      return [v, p, q]
  }
}

export const chromaGradient = (): string => {
  const rec709 = new Rec709()
  const values = Array.from({ length: 16 }).map((_, index, { length }) => {
    const r = 2 * Math.PI * (0.25 - index / length)
    const cb = Math.cos(r) * 0.5
    const cr = Math.sin(r) * 0.5
    const hsv = rgb2hsv(rec709.setYCbCr(1, cb, cr).toSRGB())
    const rgb = hsv2rgb([hsv[0], 1, 1])
    return rgb
  })
  values.push(values[0])
  return values
    .map(([r, g, b]) => `rgba(${r * 255} ${g * 255} ${b * 255} / 1)`)
    .join(',')
}
