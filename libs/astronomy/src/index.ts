// Exception for this file only.
/* eslint-disable @typescript-eslint/naming-convention */

import {
  Body,
  GeoVector,
  RotateVector,
  Rotation_EQJ_EQD,
  RotationMatrix,
  SiderealTime,
  type FlexibleDateTime
} from 'astronomy-engine'
import { Vector3 } from 'three'

function Rotation_Z(angle: number): RotationMatrix {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return new RotationMatrix([
    [cos, -sin, 0],
    [sin, cos, 0],
    [0, 0, 1]
  ])
}

export function getSunDirectionECEF(
  date: FlexibleDateTime,
  result = new Vector3()
): Vector3 {
  const vector_EQJ = GeoVector(Body.Sun, date, true)
  const rotation_EQJ_EQD = Rotation_EQJ_EQD(date)
  const vector_EQD = RotateVector(rotation_EQJ_EQD, vector_EQJ)
  const rotation_EQD_ECEF = Rotation_Z(SiderealTime(date) * (Math.PI / 12))
  const vector_ECEF = RotateVector(rotation_EQD_ECEF, vector_EQD)
  return result.set(vector_ECEF.x, vector_ECEF.y, vector_ECEF.z).normalize()
}
