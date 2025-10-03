import {
  AstroTime,
  Body,
  GeoVector,
  KM_PER_AU,
  Pivot,
  Rotation_EQJ_EQD,
  RotationAxis,
  SiderealTime,
  type RotationMatrix,
  type Vector
} from 'astronomy-engine'
import { Matrix4, Quaternion, Vector3 } from 'three'

import { radians } from '@takram/three-geospatial'

const METER_TO_AU = 0.001 / KM_PER_AU

const vectorScratch1 = /*#__PURE__*/ new Vector3()
const vectorScratch2 = /*#__PURE__*/ new Vector3()
const vectorScratch3 = /*#__PURE__*/ new Vector3()
const matrixScratch1 = /*#__PURE__*/ new Matrix4()
const matrixScratch2 = /*#__PURE__*/ new Matrix4()
const quaternionScratch = /*#__PURE__*/ new Quaternion()

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

export function getMoonFixedToECIRotationMatrix(
  date: number | Date | AstroTime,
  result = new Matrix4()
): Matrix4 {
  const time = toAstroTime(date)
  const axis = RotationAxis(Body.Moon, time)
  const north = fromAstroVector(axis.north, vectorScratch1)

  // The spin in the AxisInfo is defined as the angle of the prime meridian
  // measured from the ascending node of the body's equator on the reference
  // equator to the east.
  // See: https://link.springer.com/content/pdf/10.1007/s10569-007-9072-y.pdf
  const spin = radians(axis.spin)
  const ascendingNode = vectorScratch2.set(0, 0, 1).cross(north).normalize()
  const primeMeridian = ascendingNode
    .applyQuaternion(quaternionScratch.setFromAxisAngle(north, spin))
    .normalize()
  const east = vectorScratch3.copy(north).cross(primeMeridian).normalize()
  return result.makeBasis(primeMeridian, east, north)
}

function getDirectionECI(
  body: Body,
  time: AstroTime,
  result: Vector3,
  observerECEF?: Vector3,
  matrixECIToECEF?: Matrix4
): Vector3 {
  const vector = GeoVector(body, time, false)
  fromAstroVector(vector, result)
  if (observerECEF != null) {
    const matrixECEFToECI =
      matrixECIToECEF != null
        ? // matrixScratch1 can be in use by getDirectionECEF()
          matrixScratch2.copy(matrixECIToECEF).transpose()
        : getECIToECEFRotationMatrix(time, matrixScratch2).transpose()
    result.sub(
      vectorScratch1
        .copy(observerECEF)
        .applyMatrix4(matrixECEFToECI)
        .multiplyScalar(METER_TO_AU)
    )
  }
  return result.normalize()
}

export function getSunDirectionECI(
  date: number | Date | AstroTime,
  result = new Vector3(),
  observerECEF?: Vector3
): Vector3 {
  return getDirectionECI(Body.Sun, toAstroTime(date), result, observerECEF)
}

export function getMoonDirectionECI(
  date: number | Date | AstroTime,
  result = new Vector3(),
  observerECEF?: Vector3
): Vector3 {
  return getDirectionECI(Body.Moon, toAstroTime(date), result, observerECEF)
}

export function getSunDirectionECEF(
  date: number | Date | AstroTime,
  result = new Vector3(),
  observerECEF?: Vector3
): Vector3 {
  const time = toAstroTime(date)
  return getDirectionECI(Body.Sun, time, result, observerECEF).applyMatrix4(
    getECIToECEFRotationMatrix(time, matrixScratch1)
  )
}

export function getMoonDirectionECEF(
  date: number | Date | AstroTime,
  result = new Vector3(),
  observerECEF?: Vector3
): Vector3 {
  const time = toAstroTime(date)
  return getDirectionECI(Body.Moon, time, result, observerECEF).applyMatrix4(
    getECIToECEFRotationMatrix(time, matrixScratch1)
  )
}
