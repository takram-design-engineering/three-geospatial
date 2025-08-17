import {
  and,
  float,
  mix,
  nodeObject,
  passTexture,
  texture,
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
  FnLayout,
  FnVar,
  type Node,
  type NodeObject
} from '@takram/three-geospatial/webgpu'

const clampToBorder = /*#__PURE__*/ FnLayout({
  name: 'clampToBorder',
  type: 'float',
  inputs: [{ name: 'uv', type: 'vec2' }]
})(([uv]) => {
  return float(
    and(
      uv.x.greaterThanEqual(0),
      uv.x.lessThanEqual(1),
      uv.y.greaterThanEqual(0),
      uv.y.lessThanEqual(1)
    )
  )
})

const downsample = /*#__PURE__*/ FnVar(
  (input: TextureNode, inputSize: NodeObject<'vec2'>) => {
    const texelSize = inputSize.reciprocal()

    const uv01 = texelSize.mul(vec2(-1, 1)).add(uv()).toVertexStage()
    const uv02 = texelSize.mul(vec2(1, 1)).add(uv()).toVertexStage()
    const uv03 = texelSize.mul(vec2(-1, -1)).add(uv()).toVertexStage()
    const uv04 = texelSize.mul(vec2(1, -1)).add(uv()).toVertexStage()
    const uv05 = texelSize.mul(vec2(-2, 2)).add(uv()).toVertexStage()
    const uv06 = texelSize.mul(vec2(0, 2)).add(uv()).toVertexStage()
    const uv07 = texelSize.mul(vec2(2, 2)).add(uv()).toVertexStage()
    const uv08 = texelSize.mul(vec2(-2, 0)).add(uv()).toVertexStage()
    const uv09 = texelSize.mul(vec2(2, 0)).add(uv()).toVertexStage()
    const uv10 = texelSize.mul(vec2(-2, -2)).add(uv()).toVertexStage()
    const uv11 = texelSize.mul(vec2(0, -2)).add(uv()).toVertexStage()
    const uv12 = texelSize.mul(vec2(2, -2)).add(uv()).toVertexStage()

    const innerWeight = float(1 / 4 / 2)
    const outerWeight = float(1 / 9 / 2)
    let weight: NodeObject

    const result = input.sample(uv()).mul(outerWeight)

    weight = innerWeight.mul(
      vec4(
        clampToBorder(uv01),
        clampToBorder(uv02),
        clampToBorder(uv03),
        clampToBorder(uv04)
      )
    )
    result.addAssign(input.sample(uv01).mul(weight.x))
    result.addAssign(input.sample(uv02).mul(weight.y))
    result.addAssign(input.sample(uv03).mul(weight.z))
    result.addAssign(input.sample(uv04).mul(weight.w))

    weight = outerWeight.mul(
      vec4(
        clampToBorder(uv05),
        clampToBorder(uv06),
        clampToBorder(uv07),
        clampToBorder(uv08)
      )
    )
    result.addAssign(input.sample(uv05).mul(weight.x))
    result.addAssign(input.sample(uv06).mul(weight.y))
    result.addAssign(input.sample(uv07).mul(weight.z))
    result.addAssign(input.sample(uv08).mul(weight.w))

    weight = outerWeight.mul(
      vec4(
        clampToBorder(uv09),
        clampToBorder(uv10),
        clampToBorder(uv11),
        clampToBorder(uv12)
      )
    )
    result.addAssign(input.sample(uv09).mul(weight.x))
    result.addAssign(input.sample(uv10).mul(weight.y))
    result.addAssign(input.sample(uv11).mul(weight.z))
    result.addAssign(input.sample(uv12).mul(weight.w))

    return result
  }
)

const upsample = /*#__PURE__*/ FnVar(
  (
    input: TextureNode,
    inputSize: NodeObject<'vec2'>,
    previous: TextureNode
  ) => {
    const texelSize = inputSize.reciprocal()

    const uv1 = texelSize.mul(vec2(-1, 1)).add(uv()).toVertexStage()
    const uv2 = texelSize.mul(vec2(0, 1)).add(uv()).toVertexStage()
    const uv3 = texelSize.mul(vec2(1, 1)).add(uv()).toVertexStage()
    const uv4 = texelSize.mul(vec2(-1, 0)).add(uv()).toVertexStage()
    const uv5 = texelSize.mul(vec2(1, 0)).add(uv()).toVertexStage()
    const uv6 = texelSize.mul(vec2(-1, -1)).add(uv()).toVertexStage()
    const uv7 = texelSize.mul(vec2(0, -1)).add(uv()).toVertexStage()
    const uv8 = texelSize.mul(vec2(1, -1)).add(uv()).toVertexStage()

    const result = vec4(0)

    result.addAssign(input.sample(uv1).mul(0.0625))
    result.addAssign(input.sample(uv2).mul(0.125))
    result.addAssign(input.sample(uv3).mul(0.0625))
    result.addAssign(input.sample(uv4).mul(0.125))
    result.addAssign(input.sample(uv()).mul(0.25))
    result.addAssign(input.sample(uv5).mul(0.125))
    result.addAssign(input.sample(uv6).mul(0.0625))
    result.addAssign(input.sample(uv7).mul(0.125))
    result.addAssign(input.sample(uv8).mul(0.0625))

    return mix(previous.sample(uv()), result, 0.85)
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

export class MipmapBlurNode extends TempNode {
  static override get type(): string {
    return 'MipmapBlurNode'
  }

  inputNode: TextureNode
  levels: number

  private readonly downsampleRTs: RenderTarget[] = []
  private readonly upsampleRTs: RenderTarget[] = []
  private readonly downsampleMaterial = new NodeMaterial()
  private readonly upsampleMaterial = new NodeMaterial()

  private readonly mesh = new QuadMesh()
  private readonly inputSize = uniform(new Vector2())
  private readonly previousNode = texture()

  // WORKAROUND: The leading underscore avoids infinite recursion.
  // https://github.com/mrdoob/three.js/issues/31522
  private readonly _textureNode: TextureNode

  constructor(inputNode: TextureNode, levels = 8) {
    super('vec4')
    this.inputNode = inputNode
    this.levels = levels

    for (let i = 0; i < levels; ++i) {
      this.downsampleRTs[i] = createRenderTarget()
      if (i < levels - 1) {
        this.upsampleRTs[i] = createRenderTarget()
      }
    }
    this._textureNode = passTexture(this, this.upsampleRTs[0].texture)

    this.updateBeforeType = NodeUpdateType.RENDER
  }

  getTextureNode(): TextureNode {
    return this._textureNode
  }

  setSize(width: number, height: number): void {
    const { downsampleRTs, upsampleRTs } = this
    let w = width
    let h = height
    for (let i = 0; i < this.levels; ++i) {
      w = Math.floor(w / 2)
      h = Math.floor(h / 2)
      downsampleRTs[i].setSize(w, h)
      if (i < this.levels - 1) {
        upsampleRTs[i].setSize(w, h)
      }
    }
  }

  override updateBefore({ renderer }: NodeFrame): void {
    if (renderer == null) {
      return
    }
    rendererState = RendererUtils.resetRendererState(renderer, rendererState)

    const {
      downsampleRTs,
      upsampleRTs,
      mesh,
      inputNode,
      inputSize,
      previousNode
    } = this

    this.setSize(inputNode.value.width, inputNode.value.height)

    const texture = inputNode.value

    mesh.material = this.downsampleMaterial
    for (let i = 0; i < downsampleRTs.length; ++i) {
      const renderTarget = downsampleRTs[i]
      inputSize.value.set(inputNode.value.width, inputNode.value.height)
      renderer.setRenderTarget(renderTarget)
      mesh.render(renderer)
      inputNode.value = renderTarget.texture
    }

    mesh.material = this.upsampleMaterial
    for (let i = upsampleRTs.length - 1; i >= 0; --i) {
      const renderTarget = upsampleRTs[i]
      inputSize.value.set(inputNode.value.width, inputNode.value.height)
      previousNode.value = downsampleRTs[i].texture
      renderer.setRenderTarget(renderTarget)
      mesh.render(renderer)
      inputNode.value = renderTarget.texture
    }

    RendererUtils.restoreRendererState(renderer, rendererState)

    inputNode.value = texture
  }

  override setup(builder: NodeBuilder): Node<'vec4'> {
    const {
      downsampleMaterial,
      upsampleMaterial,
      inputNode,
      inputSize,
      previousNode
    } = this

    downsampleMaterial.fragmentNode = downsample(inputNode, inputSize)
    upsampleMaterial.fragmentNode = upsample(inputNode, inputSize, previousNode)
    downsampleMaterial.needsUpdate = true
    upsampleMaterial.needsUpdate = true

    return this._textureNode
  }

  override dispose(): void {
    super.dispose()
    for (const downsampleRT of this.downsampleRTs) {
      downsampleRT.dispose()
    }
    for (const upsampleRT of this.upsampleRTs) {
      upsampleRT.dispose()
    }
    this.downsampleMaterial.dispose()
    this.upsampleMaterial.dispose()
    this.mesh.geometry.dispose()
  }
}

export const mipmapBlur = (
  ...args: ConstructorParameters<typeof MipmapBlurNode>
): NodeObject<MipmapBlurNode> => nodeObject(new MipmapBlurNode(...args))
