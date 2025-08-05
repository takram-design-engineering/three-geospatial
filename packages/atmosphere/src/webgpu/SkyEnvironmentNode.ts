import {
  BufferGeometry,
  CubeCamera,
  Float32BufferAttribute,
  HalfFloatType,
  Mesh,
  RGBAFormat,
  Scene,
  Sphere,
  Vector3,
  type CubeTexture
} from 'three'
import { nodeObject, positionGeometry, vec4 } from 'three/tsl'
import {
  WebGLCubeRenderTarget as CubeRenderTarget,
  CubeTextureNode,
  NodeMaterial,
  NodeUpdateType,
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

export interface SkyEnvironmentNodeOptions
  extends Omit<
    SkyNodeOptions,
    'showSun' | 'showMoon' | 'showGround' | 'useContextCamera'
  > {
  textureSize?: number
}

export class SkyEnvironmentNode extends CubeTextureNode {
  static override get type(): string {
    return 'SkyEnvironmentNode'
  }

  skyNode: SkyNode
  textureSize: number

  private readonly renderTarget: CubeRenderTarget
  private readonly camera: CubeCamera
  private readonly material = new NodeMaterial()
  private readonly mesh = new Mesh(new QuadGeometry(), this.material)
  private readonly scene = new Scene().add(this.mesh)

  constructor(
    renderingContext: AtmosphereRenderingContext,
    lutNode: AtmosphereLUTNode,
    { textureSize = 64, ...options }: SkyEnvironmentNodeOptions = {}
  ) {
    const renderTarget = new CubeRenderTarget(1, {
      depthBuffer: false,
      type: HalfFloatType,
      format: RGBAFormat
    })
    super(renderTarget.texture)

    this.skyNode = sky(renderingContext, lutNode, {
      ...options,
      showSun: false,
      showMoon: false,
      showGround: true,
      useContextCamera: false
    })
    this.textureSize = textureSize
    this.renderTarget = renderTarget
    this.camera = new CubeCamera(0.1, 1000, this.renderTarget)

    this.updateBeforeType = NodeUpdateType.RENDER
  }

  get texture(): CubeTexture {
    return this.renderTarget.texture
  }

  override updateBefore({ renderer }: NodeFrame): void {
    if (renderer == null) {
      return
    }
    if (this.renderTarget.width !== this.textureSize) {
      setupRenderTarget(this.renderTarget, this.textureSize)
    }
    // TODO: Don't render when the camera doesn't move.
    this.camera.update(renderer, this.scene)
  }

  override setup(builder: NodeBuilder): unknown {
    this.material.vertexNode = vec4(positionGeometry.xy, 0, 1)
    this.material.fragmentNode = this.skyNode
    return super.setup(builder)
  }

  override dispose(): void {
    super.dispose()
    this.renderTarget.dispose()
    this.skyNode.dispose()
    this.material.dispose()
    this.mesh.geometry.dispose()
  }
}

export const skyEnvironment = (
  ...args: ConstructorParameters<typeof SkyEnvironmentNode>
): NodeObject =>
  // WORKAROUND: ShaderNodeObject<UniformNode> is not assignable to
  // ShaderNodeObject<Node>, which causes type error when assigning this to
  // scene.environmentNode.
  nodeObject(new SkyEnvironmentNode(...args)) as unknown as NodeObject
