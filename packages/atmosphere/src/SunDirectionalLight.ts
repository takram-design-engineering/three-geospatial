import {
  DirectionalLight,
  Matrix3,
  Matrix4,
  Vector3,
  type Texture
} from 'three'

import { Ellipsoid } from '@takram/three-geospatial'

import { AtmosphereParameters } from './AtmosphereParameters'
import { getSunLightColor } from './getSunLightColor'

const vectorScratch = /*#__PURE__*/ new Vector3()
const rotationScratch = /*#__PURE__*/ new Matrix3()

export interface SunDirectionalLightParameters {
  transmittanceTexture?: Texture | null
  ellipsoid?: Ellipsoid
  correctAltitude?: boolean
  sunDirection?: Vector3
  distance?: number
}

export const sunDirectionalLightParametersDefaults = {
  ellipsoid: Ellipsoid.WGS84,
  correctAltitude: true,
  distance: 1
} satisfies SunDirectionalLightParameters

export class SunDirectionalLight extends DirectionalLight {
  transmittanceTexture: Texture | null
  ellipsoid: Ellipsoid
  readonly worldToECEFMatrix = new Matrix4()
  correctAltitude: boolean
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
      sunDirection,
      distance
    } = { ...sunDirectionalLightParametersDefaults, ...params }

    this.transmittanceTexture = irradianceTexture
    this.ellipsoid = ellipsoid
    this.correctAltitude = correctAltitude
    this.sunDirection = sunDirection?.clone() ?? new Vector3()
    this.distance = distance
  }

  update(): void {
    const worldToECEFMatrix = this.worldToECEFMatrix
    const ecefToWorldRotation = rotationScratch
      .setFromMatrix4(worldToECEFMatrix)
      .transpose()

    this.position
      .copy(this.sunDirection)
      .applyMatrix3(ecefToWorldRotation)
      .normalize()
      .multiplyScalar(this.distance)
      .add(this.target.position)

    if (this.transmittanceTexture == null) {
      return
    }

    const cameraPositionECEF = this.target
      .getWorldPosition(vectorScratch)
      .applyMatrix4(worldToECEFMatrix)

    getSunLightColor(
      this.transmittanceTexture,
      cameraPositionECEF,
      this.sunDirection,
      this.color,
      {
        ellipsoid: this.ellipsoid,
        correctAltitude: this.correctAltitude
      },
      this.atmosphere
    )
  }
}
