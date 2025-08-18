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

const sizeScratch = /*#__PURE__*/ new Vector2()

let rendererState: RendererUtils.RendererState

export class DownsampleThresholdNode extends TempNode {
  static override get type(): string {
    return 'DownsampleThresholdNode'
  }

  inputNode: TextureNode | null
  @nodeType('float') thresholdLevel: number
  @nodeType('float') thresholdRange: number
  resolutionScale: Vector2

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
    resolutionScale = new Vector2(0.5, 0.5)
  ) {
    super('vec4')
    this.inputNode = inputNode
    this.thresholdLevel = thresholdLevel
    this.thresholdRange = thresholdRange
    this.resolutionScale = resolutionScale

    this._textureNode = outputTexture(this, this.renderTarget.texture)

    this.updateBeforeType = NodeUpdateType.RENDER
  }

  getTextureNode(): TextureNode {
    return this._textureNode
  }

  setSize(width: number, height: number): this {
    const { resolutionScale } = this
    const w = Math.max(Math.round(width * resolutionScale.x), 1)
    const h = Math.max(Math.round(height * resolutionScale.y), 1)
    this.renderTarget.setSize(w, h)
    return this
  }

  override updateBefore({ renderer }: NodeFrame): void {
    if (renderer == null) {
      return
    }
    rendererState = RendererUtils.resetRendererState(renderer, rendererState)

    const { inputNode } = this
    invariant(inputNode != null)

    const size = renderer.getDrawingBufferSize(sizeScratch)
    this.setSize(size.width, size.height)

    const { width, height } = inputNode.value
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
      // outer5  --  outer1  --  outer6
      //   --  inner1  --  inner2  --
      // outer2  --  center  --  outer3
      //   --  inner3  --  inner4  --
      // outer7  --  outer4  --  outer8
      const center = uv()
      const offset1 = vec4(1, 1, -1, -1).mul(texelSize.xyxy).add(center.xyxy)
      const offset2 = vec4(2, 2, -2, -2).mul(texelSize.xyxy).add(center.xyxy)
      const inner1 = offset1.zy.toVertexStage()
      const inner2 = offset1.xy.toVertexStage()
      const inner3 = offset1.zw.toVertexStage()
      const inner4 = offset1.xw.toVertexStage()
      const outer1 = vec2(center.x, offset2.y).toVertexStage()
      const outer2 = vec2(offset2.z, center.y).toVertexStage()
      const outer3 = vec2(offset2.x, center.y).toVertexStage()
      const outer4 = vec2(center.x, offset2.w).toVertexStage()
      const outer5 = offset2.zy.toVertexStage()
      const outer6 = offset2.xy.toVertexStage()
      const outer7 = offset2.zw.toVertexStage()
      const outer8 = offset2.xw.toVertexStage()

      const result = inputNode.sample(center).mul(0.125)
      result.addAssign(
        add(
          inputNode.sample(inner1),
          inputNode.sample(inner2),
          inputNode.sample(inner3),
          inputNode.sample(inner4)
        ).mul(0.125)
      )
      result.addAssign(
        add(
          inputNode.sample(outer1),
          inputNode.sample(outer2),
          inputNode.sample(outer3),
          inputNode.sample(outer4)
        ).mul(0.0625)
      )
      result.addAssign(
        add(
          inputNode.sample(outer5),
          inputNode.sample(outer6),
          inputNode.sample(outer7),
          inputNode.sample(outer8)
        ).mul(0.03125)
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
