import type { Camera } from 'three'
import { Fn, nodeObject, positionGeometry, vec4 } from 'three/tsl'
import { TempNode, type NodeBuilder } from 'three/webgpu'

import {
  inverseProjectionMatrix,
  inverseViewMatrix,
  type Node,
  type NodeObject
} from '@takram/three-geospatial/webgpu'

import type { AtmosphereLUTNode } from './AtmosphereLUTNode'
import type { AtmosphereRenderingContext } from './AtmosphereRenderingContext'
import { getSkyLuminance } from './runtime'

declare module 'three/webgpu' {
  interface NodeBuilder {
    camera?: Camera
  }
}

export interface SkyNodeOptions {
  showSun?: boolean
  showMoon?: boolean
  showGround?: boolean
}

export class SkyNode extends TempNode {
  static override get type(): string {
    return 'SkyNode'
  }

  renderingContext: AtmosphereRenderingContext
  lutNode: AtmosphereLUTNode

  // Static options
  showSun = true
  showMoon = true
  showGround = true

  constructor(
    renderingContext: AtmosphereRenderingContext,
    lutNode: AtmosphereLUTNode,
    options?: SkyNodeOptions
  ) {
    super('vec3')
    this.renderingContext = renderingContext
    this.lutNode = lutNode
    Object.assign(this, options)
  }

  override setup(builder: NodeBuilder): Node<'vec3'> {
    const { camera } = this.renderingContext
    const { worldToECEFMatrix, sunDirectionECEF, cameraPositionUnit } =
      this.renderingContext.getNodes()

    // Direction of the camera ray:
    const directionECEF = Fn(() => {
      const positionView = inverseProjectionMatrix(camera).mul(
        vec4(positionGeometry, 1)
      ).xyz
      const directionWorld = inverseViewMatrix(camera).mul(
        vec4(positionView, 0)
      ).xyz
      return worldToECEFMatrix.mul(vec4(directionWorld, 0)).xyz
    })()
      .toVertexStage()
      .normalize()

    const luminanceTransfer = getSkyLuminance(
      this.lutNode,
      cameraPositionUnit,
      directionECEF,
      0, // TODO: Shadow length
      sunDirectionECEF,
      { showGround: this.showGround }
    )
    const inscatter = luminanceTransfer.get('luminance')

    return inscatter // TODO: Direct luminance
  }
}

export const sky = (
  ...args: ConstructorParameters<typeof SkyNode>
): NodeObject<SkyNode> => nodeObject(new SkyNode(...args))
