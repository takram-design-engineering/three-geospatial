import { Color, Vector3, type Camera, type DataTexture } from 'three'

import { computeSkyTransmittance } from './computeSkyTransmittance'
import {
  ATMOSPHERE_PARAMETERS,
  SUN_SPECTRAL_RADIANCE_TO_LUMINANCE
} from './constants'

const vectorScratch = /*#__PURE__*/ new Vector3()

export function computeSunLightColor(
  transmittanceTexture: DataTexture,
  sunDirection: Vector3,
  camera: Camera,
  photometric: boolean,
  result = new Color()
): Color {
  // TODO: Consider partial visibility when the sun is at the horizon.
  const worldPosition = camera.getWorldPosition(vectorScratch)
  const transmittance = computeSkyTransmittance(
    transmittanceTexture,
    worldPosition,
    sunDirection,
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
