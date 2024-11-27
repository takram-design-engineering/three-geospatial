import { Color, Vector2, Vector3, type DataTexture } from 'three'

import { Ellipsoid } from '@takram/three-geospatial'

import { AtmosphereParameters } from './AtmosphereParameters'
import {
  TRANSMITTANCE_TEXTURE_HEIGHT,
  TRANSMITTANCE_TEXTURE_WIDTH
} from './constants'
import {
  distanceToTopAtmosphereBoundary,
  getTextureCoordFromUnitRange,
  rayIntersectsGround,
  safeSqrt
} from './helpers/functions'
import { sampleTexture } from './helpers/sampleTexture'

function getUvFromRMu(
  atmosphere: AtmosphereParameters,
  r: number,
  mu: number,
  result: Vector2
): Vector2 {
  const { topRadius, bottomRadius } = atmosphere
  const H = Math.sqrt(topRadius * topRadius - bottomRadius * bottomRadius)
  const rho = safeSqrt(r * r - bottomRadius * bottomRadius)
  const d = distanceToTopAtmosphereBoundary(atmosphere, r, mu)
  const dMin = topRadius - r
  const dMax = rho + H
  const xmu = (d - dMin) / (dMax - dMin)
  const xr = rho / H
  return result.set(
    getTextureCoordFromUnitRange(xmu, TRANSMITTANCE_TEXTURE_WIDTH),
    getTextureCoordFromUnitRange(xr, TRANSMITTANCE_TEXTURE_HEIGHT)
  )
}

const vectorScratch1 = /*#__PURE__*/ new Vector3()
const vectorScratch2 = /*#__PURE__*/ new Vector3()
const uvScratch = /*#__PURE__*/ new Vector2()

export interface SunLightColorOptions {
  ellipsoid?: Ellipsoid
  correctAltitude?: boolean
  photometric?: boolean
}

// TODO: Consider partial visibility when the sun is at the horizon.
export function getSunLightColor(
  transmittanceTexture: DataTexture,
  worldPosition: Vector3,
  sunDirection: Vector3,
  result = new Color(),
  {
    ellipsoid = Ellipsoid.WGS84,
    correctAltitude = true,
    photometric = true
  }: SunLightColorOptions = {},
  atmosphere = AtmosphereParameters.DEFAULT
): Color {
  const camera = vectorScratch1.copy(worldPosition)
  if (correctAltitude) {
    const surfacePosition = ellipsoid.projectOnSurface(
      worldPosition,
      vectorScratch2
    )
    if (surfacePosition != null) {
      camera.sub(
        ellipsoid.getOsculatingSphereCenter(
          surfacePosition,
          atmosphere.bottomRadius,
          vectorScratch2
        )
      )
    }
  }

  const transmittance = vectorScratch2
  let r = camera.length()
  let rmu = camera.dot(sunDirection)
  const { topRadius } = atmosphere
  const distanceToTopAtmosphereBoundary =
    -rmu - Math.sqrt(rmu * rmu - r * r + topRadius * topRadius)
  if (distanceToTopAtmosphereBoundary > 0) {
    r = topRadius
    rmu += distanceToTopAtmosphereBoundary
  }
  if (r > topRadius) {
    transmittance.set(1, 1, 1)
  } else {
    const mu = rmu / r
    const rayRMuIntersectsGround = rayIntersectsGround(atmosphere, r, mu)
    if (rayRMuIntersectsGround) {
      transmittance.set(0, 0, 0)
    } else {
      const uv = getUvFromRMu(atmosphere, r, mu, uvScratch)
      sampleTexture(transmittanceTexture, uv, transmittance)
    }
  }

  const radiance = transmittance.multiply(atmosphere.solarIrradiance)
  if (photometric) {
    radiance.multiply(atmosphere.sunRadianceToRelativeLuminance)
  }
  return result.setFromVector3(radiance)
}
