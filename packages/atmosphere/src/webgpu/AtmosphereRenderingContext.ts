import { Camera, Matrix4, Vector3 } from 'three'
import { sharedUniformGroup, uniform } from 'three/tsl'

import { Ellipsoid, type WritableProperties } from '@takram/three-geospatial'

import { getAltitudeCorrectionOffset } from '../getAltitudeCorrectionOffset'
import { AtmosphereParameters } from './AtmosphereParameters'

const groupNode = /*#__PURE__*/ sharedUniformGroup(
  'atmosphereRenderingContext'
).onRenderUpdate(() => {
  groupNode.needsUpdate = true
})

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

  private uniforms?: AtmosphereRenderingContextUniforms

  constructor(options: AtmosphereRenderingContextOptions = {}) {
    Object.assign(this, options)
  }

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  private createUniforms() {
    const { worldToUnit } = this.parameters.getUniforms()

    const worldToECEFMatrix = uniform(new Matrix4().identity())
      .setGroup(groupNode)
      .setName('worldToECEFMatrix')
      .onRenderUpdate((_, { value }) => {
        value.copy(this.worldToECEFMatrix)
      })
    const ecefToWorldMatrix = uniform(new Matrix4().identity())
      .setGroup(groupNode)
      .setName('ecefToWorldMatrix')
      .onRenderUpdate((_, { value }) => {
        // The worldToECEFMatrix must be orthogonal.
        value.copy(this.worldToECEFMatrix).transpose()
      })
    const sunDirectionECEF = uniform(new Vector3())
      .setGroup(groupNode)
      .setName('sunDirectionECEF')
      .onRenderUpdate((_, { value }) => {
        value.copy(this.sunDirectionECEF)
      })
    const moonDirectionECEF = uniform(new Vector3())
      .setGroup(groupNode)
      .setName('moonDirectionECEF')
      .onRenderUpdate((_, { value }) => {
        value.copy(this.moonDirectionECEF)
      })
    const cameraPositionECEF = uniform(new Vector3())
      .setGroup(groupNode)
      .setName('cameraPositionECEF')
      .onRenderUpdate((_, { value }) => {
        value
          .setFromMatrixPosition(this.camera.matrixWorld)
          .applyMatrix4(this.worldToECEFMatrix)
      })
    const altitudeCorrectionECEF = uniform(new Vector3())
      .setGroup(groupNode)
      .setName('altitudeCorrectionECEF')
      .onRenderUpdate((_, { value }) => {
        getAltitudeCorrectionOffset(
          cameraPositionECEF.value,
          this.parameters.bottomRadius,
          this.ellipsoid,
          value
        )
      })
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

  getUniforms(): AtmosphereRenderingContextUniforms {
    return (this.uniforms ??= this.createUniforms())
  }

  copy(other: AtmosphereRenderingContext): this {
    this.parameters.copy(other.parameters)
    this.camera.copy(other.camera)
    this.ellipsoid = other.ellipsoid
    this.worldToECEFMatrix.copy(other.worldToECEFMatrix)
    this.sunDirectionECEF.copy(other.sunDirectionECEF)
    this.moonDirectionECEF.copy(other.moonDirectionECEF)
    this.correctAltitude = other.correctAltitude
    return this
  }

  clone(): AtmosphereRenderingContext {
    return new AtmosphereRenderingContext().copy(this)
  }

  dispose(): void {
    this.parameters.dispose()

    const { uniforms } = this
    if (uniforms == null) {
      return
    }
    for (const key in uniforms) {
      if (Object.hasOwn(uniforms, key)) {
        const uniform = uniforms[key as keyof typeof uniforms]
        uniform.dispose()
      }
    }
  }
}

export type AtmosphereRenderingContextUniforms = ReturnType<
  AtmosphereRenderingContext['createUniforms']
>
