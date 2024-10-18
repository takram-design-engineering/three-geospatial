import { Color, Vector3, type Camera, type DataTexture } from 'three'

import { computeSkyTransmittance } from './computeSkyTransmittance'
import { ATMOSPHERE_PARAMETERS } from './constants'

const vectorScratch = /*#__PURE__*/ new Vector3()

export function computeSunLightColor(
  transmittanceTexture: DataTexture,
  sunDirection: Vector3,
  camera: Camera,
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
  return result.setFromVector3(
    transmittance.multiply(ATMOSPHERE_PARAMETERS.solarIrradiance)
  )
}
