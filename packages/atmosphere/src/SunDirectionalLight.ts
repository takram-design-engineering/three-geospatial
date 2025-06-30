import { DirectionalLight, Matrix4, Vector3, type Texture } from 'three'

import { Ellipsoid } from '@takram/three-geospatial'

import { AtmosphereParameters } from './AtmosphereParameters'
import { getSunLightColor } from './getSunLightColor'

const vectorScratch = /*#__PURE__*/ new Vector3()
const matrixScratch = /*#__PURE__*/ new Matrix4()

export interface SunDirectionalLightParameters {
  transmittanceTexture?: Texture | null
  ellipsoid?: Ellipsoid
  correctAltitude?: boolean
  photometric?: boolean
  sunDirection?: Vector3
  distance?: number
}

export const sunDirectionalLightParametersDefaults = {
  ellipsoid: Ellipsoid.WGS84,
  correctAltitude: true,
  photometric: true,
  distance: 1
} satisfies SunDirectionalLightParameters

export class SunDirectionalLight extends DirectionalLight {
  transmittanceTexture: Texture | null
  ellipsoid: Ellipsoid
  readonly ellipsoidCenter = new Vector3()
  readonly ellipsoidMatrix = new Matrix4()
  correctAltitude: boolean
  photometric: boolean
  readonly sunDirection: Vector3
  distance: number

  constructor(
    params?: SunDirectionalLightParameters,
    private readonly atmosphere = AtmosphereParameters.DEFAULT
  ) {
    super()
    const {
      irradianceTexture = null,
      ellipsoid,
      correctAltitude,
      photometric,
      sunDirection,
      distance
    } = { ...sunDirectionalLightParametersDefaults, ...params }

    this.transmittanceTexture = irradianceTexture
    this.ellipsoid = ellipsoid
    this.correctAltitude = correctAltitude
    this.photometric = photometric
    this.sunDirection = sunDirection?.clone() ?? new Vector3()
    this.distance = distance
  }

  update(): void {
    this.position
      .copy(this.sunDirection)
      .applyMatrix4(this.ellipsoidMatrix)
      .normalize()
      .multiplyScalar(this.distance)
      .add(this.target.position)

    if (this.transmittanceTexture == null) {
      return
    }

    const inverseEllipsoidMatrix = matrixScratch
      .copy(this.ellipsoidMatrix)
      .invert()
    const cameraPositionECEF = this.target
      .getWorldPosition(vectorScratch)
      .applyMatrix4(inverseEllipsoidMatrix)
      .sub(this.ellipsoidCenter)
    getSunLightColor(
      this.transmittanceTexture,
      cameraPositionECEF,
      this.sunDirection,
      this.color,
      {
        ellipsoid: this.ellipsoid,
        correctAltitude: this.correctAltitude,
        photometric: this.photometric
      },
      this.atmosphere
    )
  }
}
