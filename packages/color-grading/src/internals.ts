import { Color, Vector3 } from 'three'

const colorScratch = /*#__PURE__*/ new Color()

export function convertSRGBToLinear(
  value: Vector3 | Color,
  result = new Vector3()
): Vector3 {
  return result.setFromColor(
    (value instanceof Vector3
      ? colorScratch.set(value.x, value.y, value.z)
      : colorScratch.copy(value)
    ).convertSRGBToLinear()
  )
}
