import {
  Body,
  CombineRotation,
  GeoVector,
  RotateVector,
  Rotation_EQJ_EQD,
  RotationMatrix,
  SiderealTime,
  type FlexibleDateTime
} from 'astronomy-engine'
import { Matrix4, Vector3 } from 'three'

function RotationZ(angle: number): RotationMatrix {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return new RotationMatrix([
    [cos, -sin, 0],
    [sin, cos, 0],
    [0, 0, 1]
  ])
}

export function getDirectionECEF(
  body: Body,
  date: FlexibleDateTime,
  result = new Vector3()
): Vector3 {
  const vectorEQJ = GeoVector(body, date, true)
  const rotationEQJtoEQD = Rotation_EQJ_EQD(date)
  const vectorEQD = RotateVector(rotationEQJtoEQD, vectorEQJ)
  const rotationEQDtoECEF = RotationZ(SiderealTime(date) * (Math.PI / 12))
  const vectorECEF = RotateVector(rotationEQDtoECEF, vectorEQD)
  return result.set(vectorECEF.x, vectorECEF.y, vectorECEF.z).normalize()
}

export function getSunDirectionECEF(
  date: FlexibleDateTime,
  result = new Vector3()
): Vector3 {
  return getDirectionECEF(Body.Sun, date, result)
}

export function getMoonDirectionECEF(
  date: FlexibleDateTime,
  result = new Vector3()
): Vector3 {
  return getDirectionECEF(Body.Moon, date, result)
}

export function getECIToECEFRotationMatrix(
  date: FlexibleDateTime,
  result = new Matrix4()
): Matrix4 {
  const rotationEQJtoEQD = Rotation_EQJ_EQD(date)
  const rotationEQDtoECEF = RotationZ(SiderealTime(date) * (Math.PI / 12))
  const { rot } = CombineRotation(rotationEQJtoEQD, rotationEQDtoECEF)
  // prettier-ignore
  return result.set(
    rot[0][0], rot[0][1], rot[0][2], 0,
    rot[1][0], rot[1][1], rot[1][2], 0,
    rot[2][0], rot[2][1], rot[2][2], 0,
    0, 0, 0, 1
  ).invert()
}
