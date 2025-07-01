import { Color, Vector3 } from 'three'

import { clamp, saturate } from '@takram/three-geospatial'

import { XYZ_TO_SRGB } from './constants'

const vectorScratch = /*#__PURE__*/ new Vector3()

export function convertTemperatureToLinearSRGBChromaticity(
  temperature: number,
  result = new Color()
): Color {
  // Convert temperature to black body chromaticity
  // See: https://google.github.io/filament/Filament.html#lighting/directlighting/lightsparameterization/colortemperature
  const T = temperature
  const T2 = T ** 2
  const u =
    (0.860117757 + 1.54118254e-4 * T + 1.28641212e-7 * T2) /
    (1 + 8.42420235e-4 * T + 7.08145163e-7 * T2)
  const v =
    (0.317398726 + 4.22806245e-5 * T + 4.20481691e-8 * T2) /
    (1 - 2.89741816e-5 * T + 1.61456053e-7 * T2)
  const x = (3 * u) / (2 * u - 8 * v + 4)
  const y = (2 * v) / (2 * u - 8 * v + 4)

  // Convert chromaticity to XYZ
  const Y = 1
  const X = y > 0 ? (x * Y) / y : 0
  const Z = y > 0 ? ((1 - x - y) * Y) / y : 0

  // Convert XYZ to linear sRGB chromaticity
  const color = vectorScratch.set(X, Y, Z).applyMatrix3(XYZ_TO_SRGB)
  // XYZ directly converted from spectral locus doesn't fall inside RGB.
  color.x = saturate(color.x)
  color.y = saturate(color.y)
  color.z = saturate(color.z)
  return result.setFromVector3(color.normalize())
}

// See: https://en.wikipedia.org/wiki/Color_index
function convertBVIndexToTemperature(bvIndex: number): number {
  const bv = clamp(bvIndex, -0.4, 2)
  return 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bvIndex + 0.62))
}

export function convertBVIndexToLinearSRGBChromaticity(
  bvIndex: number,
  result = new Color()
): Color {
  return convertTemperatureToLinearSRGBChromaticity(
    convertBVIndexToTemperature(bvIndex),
    result
  )
}
