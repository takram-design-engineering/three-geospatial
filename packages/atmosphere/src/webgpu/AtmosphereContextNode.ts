import { Camera, Matrix4, Vector3 } from 'three'
import { hash } from 'three/src/nodes/core/NodeUtils.js'
import { nodeProxy, uniform, uniformGroup } from 'three/tsl'
import { Node, type NodeBuilder, type Renderer } from 'three/webgpu'

import { Ellipsoid } from '@takram/three-geospatial'
import { isWebGPU } from '@takram/three-geospatial/webgpu'

import { getAltitudeCorrectionOffset } from '../getAltitudeCorrectionOffset'
import { AtmosphereLUTNode } from './AtmosphereLUTNode'
import { AtmosphereParameters } from './AtmosphereParameters'

const groupNode = /*#__PURE__*/ uniformGroup(
  'atmosphereContext'
).onRenderUpdate(() => {
  groupNode.needsUpdate = true
})

const WEBGPU = 'WEBGPU'
const WEBGL = 'WEBGL'

type AtmosphereContextScope = typeof WEBGPU | typeof WEBGL

export class AtmosphereContextNode extends Node {
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
    scope: AtmosphereContextScope,
    parameters = new AtmosphereParameters(),
    lutNode = new AtmosphereLUTNode(scope, parameters)
  ) {
    super(null)
    this.parameters = parameters
    this.lutNode = lutNode
  }

  override customCacheKey(): number {
    return hash(
      this.camera.id,
      ...this.ellipsoid.radii,
      +this.correctAltitude,
      +this.constrainCamera,
      +this.showGround
    )
  }

  static get(builder: NodeBuilder): AtmosphereContextNode {
    const atmosphereContext = builder.getContext().atmosphere
    if (atmosphereContext == null) {
      throw new Error(
        'AtmosphereContext does not found in the builder context.'
      )
    }
    return atmosphereContext as AtmosphereContextNode
  }

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  private createNodes() {
    const worldToECEFMatrix = uniform('mat4')
      .setGroup(groupNode)
      .setName('worldToECEFMatrix')
      .onRenderUpdate((_, self) => {
        self.value = this.worldToECEFMatrix
      })

    const ecefToWorldMatrix = uniform(new Matrix4().identity())
      .setGroup(groupNode)
      .setName('ecefToWorldMatrix')
      .onRenderUpdate((_, { value }) => {
        // The worldToECEFMatrix must be orthogonal.
        value.copy(this.worldToECEFMatrix).transpose()
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

    const moonFixedToECEFMatrix = uniform(new Matrix4())
      .setGroup(groupNode)
      .setName('moonFixedToECEFMatrix')
      .onRenderUpdate((_, self) => {
        self.value = this.moonFixedToECEFMatrix
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

  override dispose(): void {
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
    super.dispose()
  }
}

export type AtmosphereContextNodes = ReturnType<
  AtmosphereContextNode['createNodes']
>

export const atmosphereContextWebGPU = nodeProxy(AtmosphereContextNode, WEBGPU)
export const atmosphereContextWebGL = nodeProxy(AtmosphereContextNode, WEBGL)

export const atmosphereContext = (
  renderer: Renderer,
  parameters?: AtmosphereParameters,
  lutNode?: AtmosphereLUTNode
): AtmosphereContextNode => {
  return isWebGPU(renderer)
    ? atmosphereContextWebGPU(parameters, lutNode)
    : atmosphereContextWebGL(parameters, lutNode)
}
