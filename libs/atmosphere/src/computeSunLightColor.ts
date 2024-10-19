import { Color, Vector3, type DataTexture } from 'three'

import { Ellipsoid } from '@geovanni/core'

import { computeSkyTransmittance } from './computeSkyTransmittance'
import {
  ATMOSPHERE_PARAMETERS,
  SUN_SPECTRAL_RADIANCE_TO_LUMINANCE
} from './constants'

const vectorScratch = /*#__PURE__*/ new Vector3()

export function computeSunLightColor(
  transmittanceTexture: DataTexture,
  worldPosition: Vector3,
  sunDirection: Vector3,
  photometric: boolean,
  ellipsoid = Ellipsoid.WGS84,
  result = new Color()
): Color {
  // TODO: Consider partial visibility when the sun is at the horizon.
  const transmittance = computeSkyTransmittance(
    transmittanceTexture,
    worldPosition,
    sunDirection,
    ellipsoid,
    vectorScratch
  )
  const solarRadLum = transmittance.multiply(
    ATMOSPHERE_PARAMETERS.solarIrradiance
  )
  if (photometric) {
    solarRadLum.multiply(SUN_SPECTRAL_RADIANCE_TO_LUMINANCE)
  }
  return result.setFromVector3(solarRadLum)
}
