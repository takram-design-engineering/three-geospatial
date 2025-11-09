import { Color, Vector3 } from 'three'

import type { ColorTuple } from './types'

const colorScratch = /*#__PURE__*/ new Color()

export function convertSRGBToLinear(
  color: ColorTuple,
  result = new Vector3()
): Vector3 {
  const { r, g, b } = colorScratch.set(...color).convertSRGBToLinear()
  return result.set(r, g, b)
}
