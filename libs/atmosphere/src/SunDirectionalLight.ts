import { DirectionalLight, Vector3, type DataTexture } from 'three'

import { Ellipsoid } from '@takram/three-geospatial'

import { AtmosphereParameters } from './AtmosphereParameters'
import { computeSunLightColor } from './computeSunLightColor'

const vectorScratch = /*#__PURE__*/ new Vector3()

export interface SunDirectionalLightParameters {
  transmittanceTexture?: DataTexture | null
  ellipsoid?: Ellipsoid
  osculateEllipsoid?: boolean
  photometric?: boolean
  worldPosition?: Vector3
  sunDirection?: Vector3
  distance?: number
}

export const sunDirectionalLightParametersDefaults = {
  ellipsoid: Ellipsoid.WGS84,
  osculateEllipsoid: true,
  photometric: true,
  distance: 1
} satisfies SunDirectionalLightParameters

export class SunDirectionalLight extends DirectionalLight {
  private readonly atmosphere: AtmosphereParameters
  transmittanceTexture: DataTexture | null
  ellipsoid: Ellipsoid
  osculateEllipsoid: boolean
  photometric: boolean
  readonly sunDirection: Vector3
  distance: number

  constructor(
    params?: SunDirectionalLightParameters,
    atmosphere = AtmosphereParameters.DEFAULT
  ) {
    super()
    const {
      irradianceTexture = null,
      ellipsoid,
      osculateEllipsoid,
      photometric,
      sunDirection,
      distance
    } = { ...sunDirectionalLightParametersDefaults, ...params }

    this.atmosphere = atmosphere
    this.transmittanceTexture = irradianceTexture
    this.ellipsoid = ellipsoid
    this.osculateEllipsoid = osculateEllipsoid
    this.photometric = photometric
    this.sunDirection = sunDirection?.clone() ?? new Vector3()
    this.distance = distance
  }

  update(): void {
    this.position
      .copy(this.sunDirection)
      .normalize()
      .multiplyScalar(this.distance)
      .add(this.target.position)

    if (this.transmittanceTexture == null) {
      return
    }
    computeSunLightColor(
      this.transmittanceTexture,
      this.target.getWorldPosition(vectorScratch),
      this.sunDirection,
      this.color,
      {
        ellipsoid: this.ellipsoid,
        osculateEllipsoid: this.osculateEllipsoid,
        photometric: this.photometric
      },
      this.atmosphere
    )
  }
}
