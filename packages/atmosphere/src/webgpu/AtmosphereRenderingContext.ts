import { Camera, Matrix4, Vector3 } from 'three'
import { uniform } from 'three/tsl'

import { Ellipsoid, type WritableProperties } from '@takram/three-geospatial'

import { getAltitudeCorrectionOffset } from '../getAltitudeCorrectionOffset'
import { AtmosphereParameters } from './AtmosphereParameters'

export type AtmosphereRenderingContextOptions = Partial<
  WritableProperties<AtmosphereRenderingContext>
>

export class AtmosphereRenderingContext {
  parameters = new AtmosphereParameters()
  camera = new Camera()
  ellipsoid = Ellipsoid.WGS84
  worldToECEFMatrix = new Matrix4().identity()
  sunDirectionECEF = new Vector3()
  moonDirectionECEF = new Vector3()
  correctAltitude = true

  private nodes?: AtmosphereRenderingContextNodes

  constructor(options: AtmosphereRenderingContextOptions = {}) {
    Object.assign(this, options)
  }

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  private createNodes() {
    const { worldToUnit } = this.parameters.getNodes()

    const worldToECEFMatrix = uniform(new Matrix4().identity()).onRenderUpdate(
      (_, { value }) => {
        value.copy(this.worldToECEFMatrix)
      }
    )
    const ecefToWorldMatrix = uniform(new Matrix4().identity()).onRenderUpdate(
      (_, { value }) => {
        // The worldToECEFMatrix must be orthogonal.
        value.copy(this.worldToECEFMatrix).transpose()
      }
    )
    const sunDirectionECEF = uniform(new Vector3()).onRenderUpdate(
      (_, { value }) => {
        value.copy(this.sunDirectionECEF)
      }
    )
    const moonDirectionECEF = uniform(new Vector3()).onRenderUpdate(
      (_, { value }) => {
        value.copy(this.moonDirectionECEF)
      }
    )
    const cameraPositionECEF = uniform(new Vector3()).onRenderUpdate(
      (_, { value }) => {
        value
          .setFromMatrixPosition(this.camera.matrixWorld)
          .applyMatrix4(this.worldToECEFMatrix)
      }
    )
    const altitudeCorrectionECEF = uniform(new Vector3()).onRenderUpdate(
      (_, { value }) => {
        getAltitudeCorrectionOffset(
          cameraPositionECEF.value,
          this.parameters.bottomRadius,
          this.ellipsoid,
          value
        )
      }
    )
    const cameraPositionUnit = (
      this.correctAltitude
        ? cameraPositionECEF.add(altitudeCorrectionECEF).mul(worldToUnit)
        : cameraPositionECEF.mul(worldToUnit)
    ).toVar()

    return {
      cameraPositionECEF,
      worldToECEFMatrix,
      ecefToWorldMatrix,
      sunDirectionECEF,
      moonDirectionECEF,
      altitudeCorrectionECEF,
      cameraPositionUnit
    }
  }

  getNodes(): AtmosphereRenderingContextNodes {
    return (this.nodes ??= this.createNodes())
  }

  // eslint-disable-next-line accessor-pairs
  set needsUpdate(value: boolean) {
    this.nodes = undefined
  }

  copy(other: AtmosphereRenderingContext): this {
    this.parameters.copy(other.parameters)
    this.camera.copy(other.camera)
    this.worldToECEFMatrix.copy(other.worldToECEFMatrix)
    this.sunDirectionECEF.copy(other.sunDirectionECEF)
    this.correctAltitude = other.correctAltitude
    return this
  }

  clone(): AtmosphereRenderingContext {
    return new AtmosphereRenderingContext().copy(this)
  }
}

export type AtmosphereRenderingContextNodes = ReturnType<
  AtmosphereRenderingContext['createNodes']
>
