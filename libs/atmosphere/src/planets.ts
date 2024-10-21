// Exception for this file only.
/* eslint-disable @typescript-eslint/naming-convention */

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

function Rotation_Z(angle: number): RotationMatrix {
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
  const vector_EQJ = GeoVector(body, date, true)
  const rotation_EQJ_EQD = Rotation_EQJ_EQD(date)
  const vector_EQD = RotateVector(rotation_EQJ_EQD, vector_EQJ)
  const rotation_EQD_ECEF = Rotation_Z(SiderealTime(date) * (Math.PI / 12))
  const vector_ECEF = RotateVector(rotation_EQD_ECEF, vector_EQD)
  return result.set(vector_ECEF.x, vector_ECEF.y, vector_ECEF.z).normalize()
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
  const rotation_EQJ_EQD = Rotation_EQJ_EQD(date)
  const rotation_EQD_ECEF = Rotation_Z(SiderealTime(date) * (Math.PI / 12))
  const { rot } = CombineRotation(rotation_EQJ_EQD, rotation_EQD_ECEF)
  // prettier-ignore
  return result.set(
    rot[0][0], rot[0][1], rot[0][2], 0,
    rot[1][0], rot[1][1], rot[1][2], 0,
    rot[2][0], rot[2][1], rot[2][2], 0,
    0, 0, 0, 1
  ).invert()
}
