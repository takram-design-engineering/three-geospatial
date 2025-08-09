import {
  AstroTime,
  Body,
  GeoVector,
  Pivot,
  Rotation_EQJ_EQD,
  SiderealTime
} from 'astronomy-engine'
import { Matrix4, Vector3 } from 'three'

const matrixScratch = /*#__PURE__*/ new Matrix4()

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
  result: Vector3
): Vector3 {
  const { x, y, z } = GeoVector(body, time, false)
  return result.set(x, y, z).normalize()
}

function getDirectionECEF(
  body: Body,
  time: AstroTime,
  result: Vector3
): Vector3 {
  const matrix = getECIToECEFRotationMatrix(time, matrixScratch)
  return getDirectionECI(body, time, result).applyMatrix4(matrix)
}

export function getSunDirectionECI(
  date: number | Date | AstroTime,
  result = new Vector3()
): Vector3 {
  return getDirectionECI(Body.Sun, makeTime(date), result)
}

export function getMoonDirectionECI(
  date: number | Date | AstroTime,
  result = new Vector3()
): Vector3 {
  return getDirectionECI(Body.Moon, makeTime(date), result)
}

export function getSunDirectionECEF(
  date: number | Date | AstroTime,
  result = new Vector3()
): Vector3 {
  return getDirectionECEF(Body.Sun, makeTime(date), result)
}

export function getMoonDirectionECEF(
  date: number | Date | AstroTime,
  result = new Vector3()
): Vector3 {
  return getDirectionECEF(Body.Moon, makeTime(date), result)
}
