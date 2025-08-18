import {
  ClampToEdgeWrapping,
  HalfFloatType,
  LinearFilter,
  RenderTarget,
  RGBAFormat,
  Vector2
} from 'three'
import {
  add,
  Fn,
  luminance,
  nodeObject,
  smoothstep,
  uniform,
  uv,
  vec2,
  vec4
} from 'three/tsl'
import {
  NodeMaterial,
  NodeUpdateType,
  QuadMesh,
  RendererUtils,
  TempNode,
  type NodeBuilder,
  type NodeFrame,
  type TextureNode
} from 'three/webgpu'
import invariant from 'tiny-invariant'

import {
  nodeType,
  outputTexture,
  referenceTo,
  type NodeObject
} from '@takram/three-geospatial/webgpu'

function createRenderTarget(): RenderTarget {
  const renderTarget = new RenderTarget(1, 1, {
    depthBuffer: false,
    type: HalfFloatType,
    format: RGBAFormat
  })
  const texture = renderTarget.texture
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.generateMipmaps = false
  return renderTarget
}

let rendererState: RendererUtils.RendererState

export class DownsampleThresholdNode extends TempNode {
  static override get type(): string {
    return 'DownsampleThresholdNode'
  }

  inputNode: TextureNode | null
  @nodeType('float') thresholdLevel: number
  @nodeType('float') thresholdRange: number
  resolution: Vector2

  private readonly renderTarget = createRenderTarget()
  private readonly material = new NodeMaterial()
  private readonly mesh = new QuadMesh(this.material)

  private readonly texelSize = uniform(new Vector2())

  // WORKAROUND: The leading underscore avoids infinite recursion.
  // https://github.com/mrdoob/three.js/issues/31522
  private readonly _textureNode: TextureNode

  constructor(
    inputNode: TextureNode | null,
    thresholdLevel = 10,
    thresholdRange = 1,
    resolution = new Vector2(0.5, 0.5)
  ) {
    super('vec4')
    this.inputNode = inputNode
    this.thresholdLevel = thresholdLevel
    this.thresholdRange = thresholdRange
    this.resolution = resolution

    this._textureNode = outputTexture(this, this.renderTarget.texture)

    this.updateBeforeType = NodeUpdateType.RENDER
  }

  getTextureNode(): TextureNode {
    return this._textureNode
  }

  setSize(width: number, height: number): void {
    const w = Math.max(Math.round(width * this.resolution.x), 1)
    const h = Math.max(Math.round(height * this.resolution.y), 1)
    this.renderTarget.setSize(w, h)
  }

  override updateBefore({ renderer }: NodeFrame): void {
    if (renderer == null) {
      return
    }
    rendererState = RendererUtils.resetRendererState(renderer, rendererState)

    const { inputNode } = this
    invariant(inputNode != null)

    const { width, height } = inputNode.value
    this.setSize(width, height)

    this.texelSize.value.set(1 / width, 1 / height)
    renderer.setRenderTarget(this.renderTarget)
    this.mesh.render(renderer)

    RendererUtils.restoreRendererState(renderer, rendererState)
  }

  override setup(builder: NodeBuilder): unknown {
    const { inputNode, texelSize } = this
    invariant(inputNode != null)
    const reference = referenceTo<DownsampleThresholdNode>(this)
    const thresholdLevel = reference('thresholdLevel')
    const thresholdRange = reference('thresholdRange')

    const main = Fn(() => {
      // outer1  --  outer2  --  outer3
      //   --  inner1  --  inner2  --
      // outer4  --  center  --  outer5
      //   --  inner3  --  inner4  --
      // outer6  --  outer7  --  outer8
      const center = uv()
      const inner1 = vec2(-1, 1).mul(texelSize).add(center).toVertexStage()
      const inner2 = vec2(1, 1).mul(texelSize).add(center).toVertexStage()
      const inner3 = vec2(-1, -1).mul(texelSize).add(center).toVertexStage()
      const inner4 = vec2(1, -1).mul(texelSize).add(center).toVertexStage()
      const outer1 = vec2(-2, 2).mul(texelSize).add(center).toVertexStage()
      const outer2 = vec2(0, 2).mul(texelSize).add(center).toVertexStage()
      const outer3 = vec2(2, 2).mul(texelSize).add(center).toVertexStage()
      const outer4 = vec2(-2, 0).mul(texelSize).add(center).toVertexStage()
      const outer5 = vec2(2, 0).mul(texelSize).add(center).toVertexStage()
      const outer6 = vec2(-2, -2).mul(texelSize).add(center).toVertexStage()
      const outer7 = vec2(0, -2).mul(texelSize).add(center).toVertexStage()
      const outer8 = vec2(2, -2).mul(texelSize).add(center).toVertexStage()

      const result = inputNode.sample(center).mul(0.125)
      result.addAssign(
        add(
          inputNode.sample(outer1),
          inputNode.sample(outer3),
          inputNode.sample(outer6),
          inputNode.sample(outer8)
        ).mul(0.03125)
      )
      result.addAssign(
        add(
          inputNode.sample(outer2),
          inputNode.sample(outer4),
          inputNode.sample(outer5),
          inputNode.sample(outer7)
        ).mul(0.0625)
      )
      result.addAssign(
        add(
          inputNode.sample(inner1),
          inputNode.sample(inner2),
          inputNode.sample(inner3),
          inputNode.sample(inner4)
        ).mul(0.125)
      )

      const scale = smoothstep(
        thresholdLevel,
        thresholdLevel.add(thresholdRange),
        luminance(result)
      )
      return vec4(result.rgb.mul(scale), result.a)
    })

    const { material } = this
    material.fragmentNode = main()
    material.needsUpdate = true

    this._textureNode.uvNode = inputNode.uvNode
    return this._textureNode
  }

  override dispose(): void {
    super.dispose()
    this.renderTarget.dispose()
    this.material.dispose()
    this.mesh.geometry.dispose()
  }
}

export const downsampleThreshold = (
  ...args: ConstructorParameters<typeof DownsampleThresholdNode>
): NodeObject<DownsampleThresholdNode> =>
  nodeObject(new DownsampleThresholdNode(...args))
