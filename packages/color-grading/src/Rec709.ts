import { Matrix3, Vector3 } from 'three'

import { remap } from '@takram/three-geospatial'

const Yx = 0.2126
const Yy = 0.7152
const Yz = 0.0722
const Cbx = -0.2126
const Cby = -0.7152
const Cbz = 0.9278
const Cbw = 1.8556
const Crx = 0.7874
const Cry = -0.7152
const Crz = -0.0722
const Crw = 1.5748

export const REC709_LUMA_COEFFICIENTS = /*#__PURE__*/ new Vector3(Yx, Yy, Yz)

// prettier-ignore
export const REC709_RGB_TO_YCBCR = /*#__PURE__*/ new Matrix3(
  Yx, Yy, Yz,
  Cbx / Cbw, Cby / Cbw, Cbz / Cbw,
  Crx / Crw, Cry / Crw, Crz / Crw
)

// prettier-ignore
export const REC709_YCBCR_TO_RGB = /*#__PURE__*/ new Matrix3(
  1, 0, Crw,
  1, -Yz * Cbw / Yy, -Yx * Crw / Yy,
  1, Cbw, 0
)

function nonlinearize(value: number): number {
  return value < 0.018 ? 4.5 * value : 1.099 * value ** 0.45 - 0.099
}

function nonlinearizeVector(value: Vector3): Vector3 {
  value.x = nonlinearize(value.x)
  value.y = nonlinearize(value.y)
  value.z = nonlinearize(value.z)
  return value
}

function linearize(value: number): number {
  return value < 0.081 ? value / 4.5 : ((value + 0.099) / 1.099) ** (1 / 0.45)
}

function linearizeVector(value: Vector3): Vector3 {
  value.x = linearize(value.x)
  value.y = linearize(value.y)
  value.z = linearize(value.z)
  return value
}

export const enum Rec709Format {
  NORMALIZED = 'NORMALIZED',
  STUDIO_8BIT = 'STUDIO_8BIT',
  STUDIO_10BIT = 'STUDIO_10BIT'
}

export function normalizeRec709(
  r: number,
  g: number,
  b: number,
  format = Rec709Format.NORMALIZED
): [number, number, number] {
  switch (format) {
    case Rec709Format.STUDIO_8BIT:
      return [
        remap(r, 16, 235, 0, 1),
        remap(g, 16, 235, 0, 1),
        remap(b, 16, 235, 0, 1)
      ]
    case Rec709Format.STUDIO_10BIT:
      return [
        remap(r, 64, 940, 0, 1),
        remap(g, 64, 940, 0, 1),
        remap(b, 64, 940, 0, 1)
      ]
    default:
      return [r, g, b]
  }
}

export function normalizeYCbCr(
  y: number,
  cb: number,
  cr: number,
  format = Rec709Format.NORMALIZED
): [number, number, number] {
  switch (format) {
    case Rec709Format.STUDIO_8BIT:
      return [
        remap(y, 16, 235, 0, 1),
        remap(cb, 16, 240, -0.5, 0.5),
        remap(cr, 16, 240, -0.5, 0.5)
      ]
    case Rec709Format.STUDIO_10BIT:
      return [
        remap(y, 64, 940, 0, 1),
        remap(cb, 64, 960, -0.5, 0.5),
        remap(cr, 64, 960, -0.5, 0.5)
      ]
    default:
      return [y, cb, cr]
  }
}

export interface Rec709Like {
  readonly r: number
  readonly g: number
  readonly b: number
}

const vectorScratch = /*#__PURE__*/ new Vector3()

export class Rec709 {
  r: number
  g: number
  b: number

  constructor(r = 0, g = 0, b = 0, format?: Rec709Format) {
    ;[this.r, this.g, this.b] = normalizeRec709(r, g, b, format)
  }

  set(r: number, g: number, b: number, format?: Rec709Format): this {
    ;[this.r, this.g, this.b] = normalizeRec709(r, g, b, format)
    return this
  }

  clone(): Rec709 {
    return new Rec709(this.r, this.g, this.b)
  }

  copy(other: Rec709Like): this {
    this.r = other.r
    this.g = other.g
    this.b = other.b
    return this
  }

  equals(other: Rec709Like): boolean {
    return other.r === this.r && other.g === this.g && other.b === this.b
  }

  luminance(): number {
    return vectorScratch
      .set(this.r, this.g, this.b)
      .dot(REC709_LUMA_COEFFICIENTS)
  }

  static fromLinearSRGB(value: Vector3, result = new Rec709()): Rec709 {
    const vector = nonlinearizeVector(vectorScratch.copy(value))
    return result.set(vector.x, vector.y, vector.z)
  }

  static fromYCbCr(
    y: number,
    cb: number,
    cr: number,
    format?: Rec709Format,
    result = new Rec709()
  ): Rec709 {
    const vector = vectorScratch
      .set(...normalizeYCbCr(y, cb, cr, format))
      .applyMatrix3(REC709_YCBCR_TO_RGB)
    return result.set(vector.x, vector.y, vector.z)
  }

  toLinearSRGB(result = new Vector3()): Vector3 {
    return linearizeVector(result.set(this.r, this.g, this.b))
  }

  toYCbCr(result = new Vector3()): Vector3 {
    return result.set(this.r, this.g, this.b).applyMatrix3(REC709_RGB_TO_YCBCR)
  }

  fromArray(array: readonly number[], offset = 0): this {
    this.r = array[offset]
    this.g = array[offset + 1]
    this.b = array[offset + 2]
    return this
  }

  toArray(array: number[] = [], offset = 0): number[] {
    array[offset] = this.r
    array[offset + 1] = this.g
    array[offset + 2] = this.b
    return array
  }

  *[Symbol.iterator](): Generator<number> {
    yield this.r
    yield this.g
    yield this.b
  }
}
