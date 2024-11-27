import { LightProbe, Vector2, Vector3, type DataTexture } from 'three'

import { Ellipsoid } from '@takram/three-geospatial'

import { AtmosphereParameters } from './AtmosphereParameters'
import {
  IRRADIANCE_TEXTURE_HEIGHT,
  IRRADIANCE_TEXTURE_WIDTH
} from './constants'
import { getTextureCoordFromUnitRange } from './helpers/functions'
import { sampleTexture } from './helpers/sampleTexture'

function getUvFromRMuS(
  { topRadius, bottomRadius }: AtmosphereParameters,
  r: number,
  muS: number,
  result: Vector2
): Vector2 {
  const xR = (r - bottomRadius) / (topRadius - bottomRadius)
  const xMuS = muS * 0.5 + 0.5
  return result.set(
    getTextureCoordFromUnitRange(xMuS, IRRADIANCE_TEXTURE_WIDTH),
    getTextureCoordFromUnitRange(xR, IRRADIANCE_TEXTURE_HEIGHT)
  )
}

// Our target is: (1 + dot(n, p)) * 0.5
// Constant term: L0 * sqrt(π)/2 == 0.5
// Linear term: L1 * π/3 * sqrt(3)/sqrt(π) == n/2
// See: https://github.com/mrdoob/three.js/blob/r170/src/math/SphericalHarmonics3.js#L85
const L0_COEFF = 1 / Math.sqrt(Math.PI)
const L1_COEFF = Math.sqrt(3) / (2 * Math.sqrt(Math.PI))

const vectorScratch1 = /*#__PURE__*/ new Vector3()
const vectorScratch2 = /*#__PURE__*/ new Vector3()
const uvScratch = /*#__PURE__*/ new Vector2()

export interface SkyLightProbeParameters {
  irradianceTexture?: DataTexture | null
  ellipsoid?: Ellipsoid
  correctAltitude?: boolean
  photometric?: boolean
  sunDirection?: Vector3
}

export const skyLightProbeParametersDefaults = {
  ellipsoid: Ellipsoid.WGS84,
  correctAltitude: true,
  photometric: true
} satisfies SkyLightProbeParameters

export class SkyLightProbe extends LightProbe {
  private readonly atmosphere: AtmosphereParameters
  irradianceTexture: DataTexture | null
  ellipsoid: Ellipsoid
  correctAltitude: boolean
  photometric: boolean
  readonly sunDirection: Vector3

  constructor(
    params?: SkyLightProbeParameters,
    atmosphere = AtmosphereParameters.DEFAULT
  ) {
    super()
    const {
      irradianceTexture = null,
      ellipsoid,
      correctAltitude,
      photometric,
      sunDirection
    } = { ...skyLightProbeParametersDefaults, ...params }

    this.atmosphere = atmosphere
    this.irradianceTexture = irradianceTexture
    this.ellipsoid = ellipsoid
    this.correctAltitude = correctAltitude
    this.photometric = photometric
    this.sunDirection = sunDirection?.clone() ?? new Vector3()
  }

  update(): void {
    if (this.irradianceTexture == null) {
      return
    }

    const position = this.getWorldPosition(vectorScratch1)
    if (this.correctAltitude) {
      const surfacePosition = this.ellipsoid.projectOnSurface(
        position,
        vectorScratch2
      )
      if (surfacePosition != null) {
        position.sub(
          this.ellipsoid.getOsculatingSphereCenter(
            surfacePosition,
            this.atmosphere.bottomRadius,
            vectorScratch2
          )
        )
      }
    }

    const r = position.length()
    const muS = position.dot(this.sunDirection) / r
    const uv = getUvFromRMuS(this.atmosphere, r, muS, uvScratch)
    const irradiance = sampleTexture(this.irradianceTexture, uv, vectorScratch2)
    if (this.photometric) {
      irradiance.multiply(this.atmosphere.skyRadianceToRelativeLuminance)
    }

    const normal = this.ellipsoid.getSurfaceNormal(position)
    const coefficients = this.sh.coefficients
    coefficients[0].copy(irradiance).multiplyScalar(L0_COEFF)
    coefficients[1].copy(irradiance).multiplyScalar(L1_COEFF * normal.y)
    coefficients[2].copy(irradiance).multiplyScalar(L1_COEFF * normal.z)
    coefficients[3].copy(irradiance).multiplyScalar(L1_COEFF * normal.x)
  }
}
