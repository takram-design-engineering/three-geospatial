import { Camera, Matrix4, Vector3 } from 'three'
import { hash } from 'three/src/nodes/core/NodeUtils.js'
import type Backend from 'three/src/renderers/common/Backend.js'
import { nodeProxy, uniform, uniformGroup } from 'three/tsl'
import { Node, type NodeBuilder, type Renderer } from 'three/webgpu'

import { Ellipsoid } from '@takram/three-geospatial'

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

export class AtmosphereContext extends Node {
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
  AtmosphereContext['createNodes']
>

export const atmosphereContextWebGPU = nodeProxy(AtmosphereContext, WEBGPU)
export const atmosphereContextWebGL = nodeProxy(AtmosphereContext, WEBGL)

export const atmosphereContext = (
  renderer: Renderer,
  parameters?: AtmosphereParameters,
  lutNode?: AtmosphereLUTNode
): AtmosphereContext => {
  // The type of Backend cannot be augmented because it is default-exported.
  const backend = renderer.backend as Backend & {
    isWebGPUBackend?: boolean
  }
  return backend.isWebGPUBackend === true
    ? atmosphereContextWebGPU(parameters, lutNode)
    : atmosphereContextWebGL(parameters, lutNode)
}
