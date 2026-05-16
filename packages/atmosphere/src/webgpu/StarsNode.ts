import { HalfFloatType, Vector2 } from 'three'
import { screenUV } from 'three/tsl'
import {
  NodeUpdateType,
  RendererUtils,
  RenderTarget,
  TempNode,
  type NodeBuilder,
  type NodeFrame,
  type TextureNode,
  type UniformNode
} from 'three/webgpu'

import { outputTexture } from '@takram/three-geospatial/webgpu'

import { DEFAULT_STARS_DATA_URL } from '../constants'
import { getAtmosphereContext } from './AtmosphereContext'
import { Stars } from './Stars'

const { resetRendererState, restoreRendererState } = RendererUtils

function createRenderTarget(): RenderTarget {
  const renderTarget = new RenderTarget(1, 1, {
    depthBuffer: false,
    type: HalfFloatType
  })
  const texture = renderTarget.texture
  texture.name = 'Stars'
  return renderTarget
}

const sizeScratch = /*#__PURE__*/ new Vector2()

export class StarsNode extends TempNode {
  static override get type(): string {
    return 'StarsNode'
  }

  stars: Stars

  private readonly textureNode: TextureNode
  private readonly renderTarget: RenderTarget
  private rendererState?: RendererUtils.RendererState

  constructor(data: string | ArrayBufferLike = DEFAULT_STARS_DATA_URL) {
    super('vec3')
    this.updateBeforeType = NodeUpdateType.FRAME

    this.stars = new Stars(data)
    this.renderTarget = createRenderTarget()

    this.textureNode = outputTexture(this, this.renderTarget.texture)
  }

  getTextureNode(): TextureNode {
    return this.textureNode
  }

  setSize(width: number, height: number): this {
    this.renderTarget.setSize(width, height)
    return this
  }

  override updateBefore(frame: NodeFrame): void {
    const { renderer } = frame
    const camera = this.stars.camera
    if (renderer == null || camera == null) {
      return
    }

    // TODO: Skip rendering if not necessary.

    const size = renderer.getDrawingBufferSize(sizeScratch)
    this.setSize(size.x, size.y)

    this.rendererState = resetRendererState(renderer, this.rendererState)

    renderer.setRenderTarget(this.renderTarget)
    renderer.render(this.stars, camera)

    restoreRendererState(renderer, this.rendererState)
  }

  override setup(builder: NodeBuilder): unknown {
    const atmosphereContext = getAtmosphereContext(builder)
    this.stars.camera = atmosphereContext.camera

    this.textureNode.uvNode = screenUV
    return this.textureNode
  }

  get pointSize(): UniformNode<number> {
    return this.stars.material.pointSize
  }

  set pointSize(value: UniformNode<number>) {
    this.stars.material.pointSize = value
  }

  get intensity(): UniformNode<number> {
    return this.stars.material.intensity
  }

  set intensity(value: UniformNode<number>) {
    this.stars.material.intensity = value
  }

  override dispose(): void {
    this.renderTarget.dispose()
    this.stars.dispose()
    super.dispose()
  }
}
