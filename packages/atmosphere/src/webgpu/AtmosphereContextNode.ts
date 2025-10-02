import { Matrix4, Vector3, type Camera } from 'three'
import { hash } from 'three/src/nodes/core/NodeUtils.js'
import { uniform, uniformGroup } from 'three/tsl'
import { Node, type NodeBuilder } from 'three/webgpu'

import { Ellipsoid, Geodetic } from '@takram/three-geospatial'

import { getAltitudeCorrectionOffset } from '../getAltitudeCorrectionOffset'
import { AtmosphereLUTNode } from './AtmosphereLUTNode'
import { AtmosphereParameters } from './AtmosphereParameters'

const groupNode = /*#__PURE__*/ uniformGroup(
  'atmosphereContext'
).onRenderUpdate(() => {
  groupNode.needsUpdate = true
})

const vectorScratch = /*#__PURE__*/ new Vector3()
const geodeticScratch = /*#__PURE__*/ new Geodetic()

export class AtmosphereContextNode extends Node {
  parameters: AtmosphereParameters
  lutNode: AtmosphereLUTNode

  // Parameters exposed as uniform nodes:
  matrixWorldToECEF = new Matrix4().identity()
  matrixECIToECEF = new Matrix4().identity()
  sunDirectionECEF = new Vector3()
  moonDirectionECEF = new Vector3()
  matrixMoonFixedToECEF = new Matrix4().identity()

  // Static options:
  camera?: Camera
  ellipsoid = Ellipsoid.WGS84
  correctAltitude = true
  constrainCamera = true
  showGround = true

  private nodes?: AtmosphereContextNodes

  constructor(
    parameters = new AtmosphereParameters(),
    lutNode = new AtmosphereLUTNode(parameters)
  ) {
    super(null)
    this.parameters = parameters
    this.lutNode = lutNode
  }

  override customCacheKey(): number {
    return hash(
      this.camera?.id ?? -1,
      ...this.ellipsoid.radii,
      +this.correctAltitude,
      +this.constrainCamera,
      +this.showGround
    )
  }

  static get(builder: NodeBuilder): AtmosphereContextNode {
    const atmosphereContext = builder.getContext().atmosphere
    if (atmosphereContext == null) {
      throw new Error('AtmosphereContext was not found in the builder context.')
    }
    return atmosphereContext as AtmosphereContextNode
  }

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  private createNodes() {
    const matrixWorldToECEF = uniform('mat4')
      .setGroup(groupNode)
      .setName('matrixWorldToECEF')
      .onRenderUpdate((_, self) => {
        self.value = this.matrixWorldToECEF
      })

    const matrixECEFToWorld = uniform(new Matrix4().identity())
      .setGroup(groupNode)
      .setName('matrixECEFToWorld')
      .onRenderUpdate((_, { value }) => {
        // The matrixWorldToECEF must be orthogonal.
        value.copy(this.matrixWorldToECEF).transpose()
      })

    const matrixECIToECEF = uniform(new Matrix4().identity())
      .setGroup(groupNode)
      .setName('matrixECIToECEF')
      .onRenderUpdate((_, self) => {
        self.value = this.matrixECIToECEF
      })

    const sunDirectionECEF = uniform('vec3')
      .setGroup(groupNode)
      .setName('sunDirectionECEF')
      .onRenderUpdate((_, self) => {
        self.value = this.sunDirectionECEF
      })

    const moonDirectionECEF = uniform(new Vector3())
      .setGroup(groupNode)
      .setName('moonDirectionECEF')
      .onRenderUpdate((_, self) => {
        self.value = this.moonDirectionECEF
      })

    const matrixMoonFixedToECEF = uniform(new Matrix4())
      .setGroup(groupNode)
      .setName('matrixMoonFixedToECEF')
      .onRenderUpdate((_, self) => {
        self.value = this.matrixMoonFixedToECEF
      })

    const cameraPositionECEF = uniform(new Vector3())
      .setGroup(groupNode)
      .setName('cameraPositionECEF')
      .onRenderUpdate((frame, { value }) => {
        const camera = this.camera ?? frame.camera
        if (camera == null) {
          return
        }
        value
          .setFromMatrixPosition(camera.matrixWorld)
          .applyMatrix4(this.matrixWorldToECEF)
      })

    const altitudeCorrectionECEF = uniform(new Vector3())
      .setGroup(groupNode)
      .setName('altitudeCorrectionECEF')
      .onRenderUpdate((frame, { value }) => {
        const camera = this.camera ?? frame.camera
        if (camera == null) {
          return
        }
        getAltitudeCorrectionOffset(
          value
            .setFromMatrixPosition(camera.matrixWorld)
            .applyMatrix4(this.matrixWorldToECEF),
          this.parameters.bottomRadius,
          this.ellipsoid,
          value
        )
      })

    const { worldToUnit } = this.parameters.getNodes()
    const cameraPositionUnit = cameraPositionECEF.mul(worldToUnit).toVar()
    const altitudeCorrectionUnit = altitudeCorrectionECEF
      .mul(worldToUnit)
      .toVar()

    const cameraHeight = uniform(0)
      .setGroup(groupNode)
      .setName('cameraHeight')
      .onRenderUpdate((frame, self) => {
        const camera = this.camera ?? frame.camera
        if (camera == null) {
          return
        }
        const positionECEF = vectorScratch
          .setFromMatrixPosition(camera.matrixWorld)
          .applyMatrix4(this.matrixWorldToECEF)
        self.value = geodeticScratch.setFromECEF(positionECEF).height
      })

    return {
      matrixWorldToECEF,
      matrixECEFToWorld,
      matrixECIToECEF,
      sunDirectionECEF,
      moonDirectionECEF,
      matrixMoonFixedToECEF,
      cameraPositionECEF,
      altitudeCorrectionECEF,
      cameraPositionUnit,
      altitudeCorrectionUnit,
      cameraHeight
    }
  }

  getNodes(): AtmosphereContextNodes {
    return (this.nodes ??= this.createNodes())
  }

  override dispose(): void {
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
    super.dispose()
  }
}

export type AtmosphereContextNodes = ReturnType<
  AtmosphereContextNode['createNodes']
>
