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
  direction?: Vector3
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
  readonly direction: Vector3
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
      direction,
      distance
    } = { ...sunDirectionalLightParametersDefaults, ...params }

    this.atmosphere = atmosphere
    this.transmittanceTexture = irradianceTexture
    this.ellipsoid = ellipsoid
    this.osculateEllipsoid = osculateEllipsoid
    this.photometric = photometric
    this.direction = direction?.clone() ?? new Vector3()
    this.distance = distance
  }

  update(): void {
    this.position
      .copy(this.direction)
      .normalize()
      .multiplyScalar(this.distance)
      .add(this.target.position)

    if (this.transmittanceTexture == null) {
      return
    }
    computeSunLightColor(
      this.transmittanceTexture,
      this.target.getWorldPosition(vectorScratch),
      this.direction,
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
