import { Camera, Matrix4, Vector3 } from 'three'
import { sharedUniformGroup, uniform } from 'three/tsl'

import { Ellipsoid } from '@takram/three-geospatial'

import { getAltitudeCorrectionOffset } from '../getAltitudeCorrectionOffset'
import { AtmosphereParameters } from './AtmosphereParameters'

const groupNode = /*#__PURE__*/ sharedUniformGroup(
  'atmosphereRenderingContext'
).onRenderUpdate(() => {
  groupNode.needsUpdate = true
})

export class AtmosphereRenderingContext {
  parameters: AtmosphereParameters

  camera = new Camera()
  ellipsoid = Ellipsoid.WGS84
  worldToECEFMatrix = new Matrix4().identity()
  sunDirectionECEF = new Vector3()
  moonDirectionECEF = new Vector3()
  moonFixedToECEFMatrix = new Matrix4().identity()
  correctAltitude = true

  private nodes?: AtmosphereRenderingContextNodes

  constructor(parameters = new AtmosphereParameters()) {
    this.parameters = parameters
  }

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  private createNodes() {
    const { worldToUnit } = this.parameters.getNodes()

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
    const moonFixedToECEFMatrix = uniform(new Matrix4())
      .setGroup(groupNode)
      .setName('moonFixedToECEFMatrix')
      .onRenderUpdate((_, { value }) => {
        value.copy(this.moonFixedToECEFMatrix)
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
          value
            .setFromMatrixPosition(this.camera.matrixWorld)
            .applyMatrix4(this.worldToECEFMatrix),
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
      moonFixedToECEFMatrix,
      altitudeCorrectionECEF,
      cameraPositionUnit
    }
  }

  getNodes(): AtmosphereRenderingContextNodes {
    return (this.nodes ??= this.createNodes())
  }

  copy(other: AtmosphereRenderingContext): this {
    this.parameters.copy(other.parameters)
    this.camera.copy(other.camera)
    this.ellipsoid = other.ellipsoid
    this.worldToECEFMatrix.copy(other.worldToECEFMatrix)
    this.sunDirectionECEF.copy(other.sunDirectionECEF)
    this.moonDirectionECEF.copy(other.moonDirectionECEF)
    this.moonFixedToECEFMatrix.copy(other.moonFixedToECEFMatrix)
    this.correctAltitude = other.correctAltitude
    return this
  }

  clone(): AtmosphereRenderingContext {
    return new AtmosphereRenderingContext().copy(this)
  }

  dispose(): void {
    this.parameters.dispose()

    const { nodes } = this
    if (nodes == null) {
      return
    }
    for (const key in nodes) {
      if (Object.hasOwn(nodes, key)) {
        const node = nodes[key as keyof typeof nodes]
        node.dispose()
      }
    }
  }
}

export type AtmosphereRenderingContextNodes = ReturnType<
  AtmosphereRenderingContext['createNodes']
>
