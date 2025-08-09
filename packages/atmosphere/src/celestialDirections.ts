import {
  AstroTime,
  Body,
  GeoVector,
  KM_PER_AU,
  Pivot,
  Rotation_EQJ_EQD,
  SiderealTime,
  type RotationMatrix,
  type Vector
} from 'astronomy-engine'
import { Matrix4, Vector3 } from 'three'

const METER_TO_AU = 0.001 / KM_PER_AU

const vectorScratch = /*#__PURE__*/ new Vector3()
const matrixScratch1 = /*#__PURE__*/ new Matrix4()
const matrixScratch2 = /*#__PURE__*/ new Matrix4()

export function toAstroTime(value: number | Date | AstroTime): AstroTime {
  return value instanceof AstroTime
    ? value
    : // Prefer number to be JS timestamp.
      new AstroTime(value instanceof Date ? value : new Date(value))
}

export function fromAstroVector(
  vector: Vector,
  result = new Vector3()
): Vector3 {
  const { x, y, z } = vector
  return result.set(x, y, z)
}

export function fromAstroRotationMatrix(
  matrix: RotationMatrix,
  result = new Matrix4()
): Matrix4 {
  const [row0, row1, row2] = matrix.rot
  // prettier-ignore
  return result.set(
    row0[0], row1[0], row2[0], 0,
    row0[1], row1[1], row2[1], 0,
    row0[2], row1[2], row2[2], 0,
    0, 0, 0, 1
  )
}

export function getECIToECEFRotationMatrix(
  date: number | Date | AstroTime,
  result = new Matrix4()
): Matrix4 {
  const time = toAstroTime(date)
  const matrix = Pivot(Rotation_EQJ_EQD(time), 2, -15 * SiderealTime(time))
  return fromAstroRotationMatrix(matrix, result)
}

function getDirectionECI(
  body: Body,
  time: AstroTime,
  result: Vector3,
  observer?: Vector3,
  matrixECIToECEF?: Matrix4
): Vector3 {
  const vector = GeoVector(body, time, false)
  fromAstroVector(vector, result)
  if (observer != null) {
    const matrixECEFToECI =
      matrixECIToECEF != null
        ? // matrixScratch1 can be in use by getDirectionECEF()
          matrixScratch2.copy(matrixECIToECEF).transpose()
        : getECIToECEFRotationMatrix(time, matrixScratch2).transpose()
    result.sub(
      vectorScratch
        .copy(observer)
        .applyMatrix4(matrixECEFToECI)
        .multiplyScalar(METER_TO_AU)
    )
  }
  return result.normalize()
}

function getDirectionECEF(
  body: Body,
  time: AstroTime,
  result: Vector3,
  observer?: Vector3
): Vector3 {
  const matrixECIToECEF = getECIToECEFRotationMatrix(time, matrixScratch1)
  getDirectionECI(body, time, result, observer, matrixECIToECEF)
  return result.applyMatrix4(matrixECIToECEF)
}

export function getSunDirectionECI(
  date: number | Date | AstroTime,
  result = new Vector3(),
  observer?: Vector3
): Vector3 {
  return getDirectionECI(Body.Sun, toAstroTime(date), result, observer)
}

export function getMoonDirectionECI(
  date: number | Date | AstroTime,
  result = new Vector3(),
  observer?: Vector3
): Vector3 {
  return getDirectionECI(Body.Moon, toAstroTime(date), result, observer)
}

export function getSunDirectionECEF(
  date: number | Date | AstroTime,
  result = new Vector3(),
  observer?: Vector3
): Vector3 {
  return getDirectionECEF(Body.Sun, toAstroTime(date), result, observer)
}

export function getMoonDirectionECEF(
  date: number | Date | AstroTime,
  result = new Vector3(),
  observer?: Vector3
): Vector3 {
  return getDirectionECEF(Body.Moon, toAstroTime(date), result, observer)
}
