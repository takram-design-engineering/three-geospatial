import { Camera } from 'three'
import { Fn, nodeObject, positionGeometry, vec4 } from 'three/tsl'
import { NodeBuilder, TempNode } from 'three/webgpu'

import {
  inverseProjectionMatrix,
  inverseViewMatrix,
  needsUpdate,
  Node,
  type NodeObject
} from '@takram/three-geospatial/webgpu'

import { AtmosphereLUTNode } from './AtmosphereLUTNode'
import { AtmosphereRenderingContext } from './AtmosphereRenderingContext'
import { getSkyLuminance } from './runtime'

declare module 'three/webgpu' {
  interface NodeBuilder {
    camera?: Camera
  }
}

export class SkyNode extends TempNode {
  static override get type(): string {
    return 'SkyNode'
  }

  @needsUpdate() renderingContext: AtmosphereRenderingContext
  @needsUpdate() lutNode: AtmosphereLUTNode

  // Static options
  @needsUpdate() sun = true
  @needsUpdate() moon = true
  @needsUpdate() ground = true

  constructor(
    renderingContext: AtmosphereRenderingContext,
    lutNode: AtmosphereLUTNode
  ) {
    super('vec4')
    this.renderingContext = renderingContext
    this.lutNode = lutNode
  }

  override setup(builder: NodeBuilder): Node<'vec3'> {
    const { camera } = this.renderingContext
    const { worldToECEFMatrix, sunDirectionECEF, cameraPositionUnit } =
      this.renderingContext.getUniforms()

    // Direction of the camera ray:
    const directionECEF = Fn(() => {
      const positionView = inverseProjectionMatrix(camera).mul(
        vec4(positionGeometry, 1)
      ).xyz
      const directionWorld = inverseViewMatrix(camera).mul(
        vec4(positionView, 0)
      ).xyz
      const directionECEF = worldToECEFMatrix.mul(vec4(directionWorld, 0)).xyz
      return directionECEF
    })()
      .toVertexStage()
      .normalize()

    const luminanceTransfer = getSkyLuminance(
      this.lutNode,
      cameraPositionUnit,
      directionECEF,
      0, // TODO: Shadow length
      sunDirectionECEF
    ).toVar()
    const inscatter = luminanceTransfer.get('luminance')

    return inscatter // TODO: Direct luminance
  }
}

export const sky = (
  ...args: ConstructorParameters<typeof SkyNode>
): NodeObject<SkyNode> => nodeObject(new SkyNode(...args))
