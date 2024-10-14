import { Color, Matrix3, Vector2, Vector3 } from 'three'

import { clamp } from './math'

const vector2Scratch = /*#__PURE__*/ new Vector2()
const vector3Scratch = /*#__PURE__*/ new Vector3()

// See: https://en.wikipedia.org/wiki/Color_index
export function convertBVIndexToTemperature(bvIndex: number): number {
  const bv = clamp(bvIndex, -0.4, 2)
  return 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bvIndex + 0.62))
}

// See: https://google.github.io/filament/Filament.html#lighting/directlighting/lightsparameterization/colortemperature
export function convertTemperatureToBlackBodyChromaticity(
  temperature: number,
  result = new Vector2()
): Vector2 {
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
  return result.set(x, y)
}

export function convertChromaticityToXYZ(
  chromaticity: Vector2,
  Y = 1,
  result = new Vector3()
): Vector3 {
  const { x, y } = chromaticity
  const X = y > 0 ? (x * Y) / y : 0
  const Z = y > 0 ? ((1 - x - y) * Y) / y : 0
  return result.set(X, Y, Z)
}

// prettier-ignore
const XYZToLinearRGB = /*#__PURE__*/ new Matrix3(
  3.2404542, -1.5371385, -0.4985314,
  -0.9692660, 1.8760108, 0.0415560,
  0.0556434, -0.2040259, 1.0572252
)

export function convertXYZToLinearSRGBChromaticity(
  xyz: Vector3,
  result = new Color()
): Color {
  const color = vector3Scratch.copy(xyz).applyMatrix3(XYZToLinearRGB)
  // XYZ directly converted from spectral locus doesn't fall inside RGB.
  color.x = clamp(color.x, 0, 1)
  color.y = clamp(color.y, 0, 1)
  color.z = clamp(color.z, 0, 1)
  return result.setFromVector3(color.normalize())
}

function applyCompanding(x: number): number {
  return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055
}

export function convertLinearSRGBToSRGB(
  { r, g, b }: Color,
  result = new Color()
): Color {
  return result.setRGB(
    applyCompanding(r),
    applyCompanding(g),
    applyCompanding(b)
  )
}

export function convertBVIndexToLinearSRGBChromaticity(
  bvIndex: number,
  result = new Color()
): Color {
  const T = convertBVIndexToTemperature(bvIndex)
  const xy = convertTemperatureToBlackBodyChromaticity(T, vector2Scratch)
  const XYZ = convertChromaticityToXYZ(xy, 1, vector3Scratch)
  return convertXYZToLinearSRGBChromaticity(XYZ, result)
}
