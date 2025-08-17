import { Camera, Matrix4, Vector3 } from 'three'
import { uniform, uniformGroup } from 'three/tsl'
import type { NodeBuilder } from 'three/webgpu'

import { Ellipsoid } from '@takram/three-geospatial'

import { getAltitudeCorrectionOffset } from '../getAltitudeCorrectionOffset'
import { AtmosphereLUTNode } from './AtmosphereLUTNode'
import { AtmosphereParameters } from './AtmosphereParameters'

const groupNode = /*#__PURE__*/ uniformGroup(
  'atmosphereContext'
).onRenderUpdate(() => {
  groupNode.needsUpdate = true
})

export class AtmosphereContext {
  parameters: AtmosphereParameters
  lutNode: AtmosphereLUTNode

  camera = new Camera()
  ellipsoid = Ellipsoid.WGS84

  // Parameters exposed as uniform nodes:
  worldToECEFMatrix = new Matrix4().identity()
  sunDirectionECEF = new Vector3()
  moonDirectionECEF = new Vector3()
  moonFixedToECEFMatrix = new Matrix4().identity()

  // Static options:
  correctAltitude = true
  constrainCamera = true
  showGround = true

  private nodes?: AtmosphereContextNodes

  constructor(
    parameters = new AtmosphereParameters(),
    lutNode = new AtmosphereLUTNode(parameters)
  ) {
    this.parameters = parameters
    this.lutNode = lutNode
  }

  static get(builder: NodeBuilder): AtmosphereContext {
    const atmosphereContext = builder.getContext().atmosphere
    if (atmosphereContext == null) {
      throw new Error(
        'AtmosphereContext does not found in the builder context.'
      )
    }
    return atmosphereContext as AtmosphereContext
  }

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  private createNodes() {
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

    const { worldToUnit } = this.parameters.getNodes()
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

  getNodes(): AtmosphereContextNodes {
    return (this.nodes ??= this.createNodes())
  }

  copy(other: AtmosphereContext): this {
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

  clone(): AtmosphereContext {
    return new AtmosphereContext().copy(this)
  }

  dispose(): void {
    this.parameters.dispose()
    this.lutNode.dispose()

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

export type AtmosphereContextNodes = ReturnType<
  AtmosphereContext['createNodes']
>
