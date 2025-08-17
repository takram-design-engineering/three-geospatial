import {
  add,
  luminance,
  nodeObject,
  passTexture,
  reference,
  smoothstep,
  uniform,
  uv,
  vec2,
  vec4
} from 'three/tsl'
import {
  ClampToEdgeWrapping,
  HalfFloatType,
  LinearFilter,
  NodeMaterial,
  NodeUpdateType,
  QuadMesh,
  RendererUtils,
  RenderTarget,
  RGBAFormat,
  TempNode,
  Vector2,
  type NodeBuilder,
  type NodeFrame,
  type TextureNode
} from 'three/webgpu'

import {
  FnVar,
  type Node,
  type NodeObject
} from '@takram/three-geospatial/webgpu'

const fragment = /*#__PURE__*/ FnVar(
  (
    input: TextureNode,
    inputSize: NodeObject<'vec2'>,
    level: NodeObject<'float'>,
    range: NodeObject<'float'>
  ) => {
    const texelSize = inputSize.reciprocal()

    // outer1  --  outer2  --  outer3
    //   --  inner1  --  inner2  --
    // outer4  --  center  --  outer5
    //   --  inner3  --  inner4  --
    // outer6  --  outer7  --  outer8
    const inner1 = texelSize.mul(vec2(-1, 1)).add(uv()).toVertexStage()
    const inner2 = texelSize.mul(vec2(1, 1)).add(uv()).toVertexStage()
    const inner3 = texelSize.mul(vec2(-1, -1)).add(uv()).toVertexStage()
    const inner4 = texelSize.mul(vec2(1, -1)).add(uv()).toVertexStage()
    const outer1 = texelSize.mul(vec2(-2, 2)).add(uv()).toVertexStage()
    const outer2 = texelSize.mul(vec2(0, 2)).add(uv()).toVertexStage()
    const outer3 = texelSize.mul(vec2(2, 2)).add(uv()).toVertexStage()
    const outer4 = texelSize.mul(vec2(-2, 0)).add(uv()).toVertexStage()
    const outer5 = texelSize.mul(vec2(2, 0)).add(uv()).toVertexStage()
    const outer6 = texelSize.mul(vec2(-2, -2)).add(uv()).toVertexStage()
    const outer7 = texelSize.mul(vec2(0, -2)).add(uv()).toVertexStage()
    const outer8 = texelSize.mul(vec2(2, -2)).add(uv()).toVertexStage()

    const result = input.sample(uv()).mul(0.125)

    result.addAssign(
      add(
        input.sample(outer1),
        input.sample(outer3),
        input.sample(outer6),
        input.sample(outer8)
      ).mul(0.03125)
    )

    result.addAssign(
      add(
        input.sample(outer2),
        input.sample(outer4),
        input.sample(outer5),
        input.sample(outer7)
      ).mul(0.0625)
    )

    result.addAssign(
      add(
        input.sample(inner1),
        input.sample(inner2),
        input.sample(inner3),
        input.sample(inner4)
      ).mul(0.125)
    )

    const scale = smoothstep(level, level.add(range), luminance(result))
    return vec4(result.rgb.mul(scale), result.a)
  }
)

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

  inputNode: TextureNode
  thresholdLevel = 0
  thresholdRange = 0

  private readonly renderTarget: RenderTarget
  private readonly material = new NodeMaterial()

  private readonly mesh = new QuadMesh()
  private readonly inputSize = uniform(new Vector2())

  // WORKAROUND: The leading underscore avoids infinite recursion.
  // https://github.com/mrdoob/three.js/issues/31522
  private readonly _textureNode: TextureNode

  constructor(inputNode: TextureNode, thresholdLevel = 10, thresholdRange = 1) {
    super('vec4')
    this.inputNode = inputNode
    this.thresholdLevel = thresholdLevel
    this.thresholdRange = thresholdRange

    this.renderTarget = createRenderTarget()
    this._textureNode = passTexture(this, this.renderTarget.texture)

    this.updateBeforeType = NodeUpdateType.RENDER
  }

  getTextureNode(): TextureNode {
    return this._textureNode
  }

  setSize(width: number, height: number): void {
    this.renderTarget.setSize(Math.floor(width / 2), Math.floor(height / 2))
  }

  override updateBefore({ renderer }: NodeFrame): void {
    if (renderer == null) {
      return
    }
    rendererState = RendererUtils.resetRendererState(renderer, rendererState)

    const { inputNode } = this
    this.setSize(inputNode.value.width, inputNode.value.height)

    this.inputSize.value.set(inputNode.value.width, inputNode.value.height)
    renderer.setRenderTarget(this.renderTarget)
    this.mesh.render(renderer)

    RendererUtils.restoreRendererState(renderer, rendererState)
  }

  override setup(builder: NodeBuilder): Node<'vec4'> {
    const { material } = this
    material.fragmentNode = fragment(
      this.inputNode,
      this.inputSize,
      reference('thresholdLevel', 'float', this),
      reference('thresholdRange', 'float', this)
    )
    material.needsUpdate = true

    this.mesh.material = material

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
