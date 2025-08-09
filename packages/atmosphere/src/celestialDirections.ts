import {
  AstroTime,
  Body,
  GeoVector,
  KM_PER_AU,
  Pivot,
  Rotation_EQJ_EQD,
  SiderealTime
} from 'astronomy-engine'
import { Matrix4, Vector3 } from 'three'

const METER_TO_AU = 0.001 / KM_PER_AU

const vectorScratch = /*#__PURE__*/ new Vector3()
const matrixScratch1 = /*#__PURE__*/ new Matrix4()
const matrixScratch2 = /*#__PURE__*/ new Matrix4()

// Prefer number to be JS timestamp.
function makeTime(value: number | Date | AstroTime): AstroTime {
  return value instanceof AstroTime
    ? value
    : new AstroTime(value instanceof Date ? value : new Date(value))
}

export function getECIToECEFRotationMatrix(
  date: number | Date | AstroTime,
  result = new Matrix4()
): Matrix4 {
  const time = makeTime(date)
  const { rot } = Pivot(Rotation_EQJ_EQD(time), 2, -15 * SiderealTime(time))
  // prettier-ignore
  return result.set(
    rot[0][0], rot[1][0], rot[2][0], 0,
    rot[0][1], rot[1][1], rot[2][1], 0,
    rot[0][2], rot[1][2], rot[2][2], 0,
    0, 0, 0, 1
  )
}

function getDirectionECI(
  body: Body,
  time: AstroTime,
  result: Vector3,
  observer?: Vector3,
  matrixECIToECEF?: Matrix4
): Vector3 {
  const { x, y, z } = GeoVector(body, time, false)
  result.set(x, y, z)
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
  return getDirectionECI(Body.Sun, makeTime(date), result, observer)
}

export function getMoonDirectionECI(
  date: number | Date | AstroTime,
  result = new Vector3(),
  observer?: Vector3
): Vector3 {
  return getDirectionECI(Body.Moon, makeTime(date), result, observer)
}

export function getSunDirectionECEF(
  date: number | Date | AstroTime,
  result = new Vector3(),
  observer?: Vector3
): Vector3 {
  return getDirectionECEF(Body.Sun, makeTime(date), result, observer)
}

export function getMoonDirectionECEF(
  date: number | Date | AstroTime,
  result = new Vector3(),
  observer?: Vector3
): Vector3 {
  return getDirectionECEF(Body.Moon, makeTime(date), result, observer)
}
