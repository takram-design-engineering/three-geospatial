import {
  CubeCamera,
  WebGLCubeRenderTarget as CubeRenderTarget,
  HalfFloatType,
  Mesh,
  RGBAFormat,
  Scene
} from 'three'
import { nodeObject, pmremTexture, positionGeometry, vec4 } from 'three/tsl'
import {
  NodeMaterial,
  NodeUpdateType,
  TempNode,
  type NodeBuilder,
  type NodeFrame
} from 'three/webgpu'

import { QuadGeometry } from '@takram/three-geospatial'
import type { NodeObject } from '@takram/three-geospatial/webgpu'

import type { AtmosphereContext } from './AtmosphereContext'
import { skyWorld, type SkyNode } from './SkyNode'

export class SkyEnvironmentNode extends TempNode {
  static override get type(): string {
    return 'SkyEnvironmentNode'
  }

  skyNode: SkyNode

  private readonly renderTarget: CubeRenderTarget
  private readonly camera: CubeCamera
  private readonly material = new NodeMaterial()
  private readonly mesh = new Mesh(new QuadGeometry(), this.material)
  private readonly scene = new Scene().add(this.mesh)

  constructor(atmosphereContext: AtmosphereContext, size = 64) {
    super('vec3')

    this.skyNode = skyWorld(atmosphereContext)
    this.skyNode.showSun = false
    this.skyNode.showMoon = false

    this.renderTarget = new CubeRenderTarget(size, {
      depthBuffer: false,
      type: HalfFloatType,
      format: RGBAFormat
    })
    this.camera = new CubeCamera(0.1, 1000, this.renderTarget)

    this.updateBeforeType = NodeUpdateType.FRAME
  }

  override updateBefore({ renderer }: NodeFrame): void {
    if (renderer == null) {
      return
    }
    // TODO: Don't render when the camera doesn't move.
    this.camera.update(renderer, this.scene)
  }

  override setup(builder: NodeBuilder): unknown {
    this.material.vertexNode = vec4(positionGeometry.xy, 0, 1)
    this.material.fragmentNode = this.skyNode
    return pmremTexture(this.renderTarget.texture)
  }

  override dispose(): void {
    this.renderTarget.dispose()
    this.skyNode.dispose() // TODO: Conditionally depending on the owner.
    this.material.dispose()
    super.dispose()
  }
}

export const skyEnvironment = (
  ...args: ConstructorParameters<typeof SkyEnvironmentNode>
): NodeObject<SkyEnvironmentNode> => nodeObject(new SkyEnvironmentNode(...args))
