import {
  BufferGeometry,
  CubeCamera,
  Float32BufferAttribute,
  HalfFloatType,
  Mesh,
  RGBAFormat,
  Scene,
  Sphere,
  Vector3
} from 'three'
import { cubeTexture, nodeObject, positionGeometry, vec4 } from 'three/tsl'
import {
  WebGLCubeRenderTarget as CubeRenderTarget,
  NodeMaterial,
  NodeUpdateType,
  TempNode,
  type NodeBuilder,
  type NodeFrame
} from 'three/webgpu'

import type { NodeObject } from '@takram/three-geospatial/webgpu'

import type { AtmosphereLUTNode } from './AtmosphereLUTNode'
import type { AtmosphereRenderingContext } from './AtmosphereRenderingContext'
import { sky, type SkyNode, type SkyNodeOptions } from './SkyNode'

class QuadGeometry extends BufferGeometry {
  constructor() {
    super()
    this.boundingSphere = new Sphere()
    this.boundingSphere.set(new Vector3(), Infinity)
    this.setAttribute(
      'position',
      new Float32BufferAttribute([-1, -1, 3, -1, -1, 3], 2)
    )
  }
}

function setupRenderTarget(renderTarget: CubeRenderTarget, size: number): void {
  renderTarget.setSize(size, size)
  for (const image of renderTarget.texture.images) {
    image.width = size
    image.height = size
    image.depth = size
  }
}

export interface SkyBoxNodeOptions extends SkyNodeOptions {
  size?: number
}

export class SkyBoxNode extends TempNode {
  skyNode: SkyNode
  size: number

  private readonly renderTarget = new CubeRenderTarget(1, {
    depthBuffer: false,
    type: HalfFloatType,
    format: RGBAFormat
  })

  private readonly camera = new CubeCamera(0.1, 1000, this.renderTarget)
  private readonly material = new NodeMaterial()
  private readonly mesh = new Mesh(new QuadGeometry(), this.material)
  private readonly scene = new Scene().add(this.mesh)

  constructor(
    renderingContext: AtmosphereRenderingContext,
    lutNode: AtmosphereLUTNode,
    { size = 64, ...options }: SkyBoxNodeOptions = {}
  ) {
    super('vec4')
    this.skyNode = sky(renderingContext, lutNode, {
      ...options,
      showSun: false,
      showMoon: false,
      showGround: true,
      useContextCamera: false
    })
    this.size = size
    this.updateBeforeType = NodeUpdateType.RENDER
  }

  override updateBefore({ renderer }: NodeFrame): void {
    if (renderer == null) {
      return
    }
    if (this.renderTarget.width !== this.size) {
      setupRenderTarget(this.renderTarget, this.size)
    }
    // TODO: Don't render when the camera doesn't move.
    this.camera.update(renderer, this.scene)
  }

  override setup(builder: NodeBuilder): unknown {
    this.material.vertexNode = vec4(positionGeometry.xy, 0, 1)
    this.material.fragmentNode = this.skyNode
    return cubeTexture(this.renderTarget.texture)
  }

  override dispose(): void {
    super.dispose()
    this.renderTarget.dispose()
    this.skyNode.dispose()
    this.material.dispose()
    this.mesh.geometry.dispose()
  }
}

export const skyBox = (
  ...args: ConstructorParameters<typeof SkyBoxNode>
): NodeObject<SkyBoxNode> => nodeObject(new SkyBoxNode(...args))
