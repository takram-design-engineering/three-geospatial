import {
  add,
  Fn,
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
import invariant from 'tiny-invariant'

import { clampToBorder, type NodeObject } from '@takram/three-geospatial/webgpu'

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

  inputNode: TextureNode | null
  levels: number

  private readonly downsampleRTs: RenderTarget[] = []
  private readonly upsampleRTs: RenderTarget[] = []
  private readonly downsampleMaterial = new NodeMaterial()
  private readonly upsampleMaterial = new NodeMaterial()
  private readonly mesh = new QuadMesh()

  private readonly texelSize = uniform(new Vector2())
  private readonly previousNode = texture()

  // WORKAROUND: The leading underscore avoids infinite recursion.
  // https://github.com/mrdoob/three.js/issues/31522
  private readonly _textureNode: TextureNode

  constructor(inputNode: TextureNode | null, levels = 8) {
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
      w = Math.max(Math.round(w / 2), 1)
      h = Math.max(Math.round(h / 2), 1)
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
      texelSize,
      previousNode
    } = this
    invariant(inputNode != null)

    const originalTexture = inputNode.value

    const { width, height } = inputNode.value
    this.setSize(width, height)

    mesh.material = this.downsampleMaterial
    for (const renderTarget of downsampleRTs) {
      const { width, height } = inputNode.value
      texelSize.value.set(1 / width, 1 / height)
      renderer.setRenderTarget(renderTarget)
      mesh.render(renderer)
      inputNode.value = renderTarget.texture
    }

    mesh.material = this.upsampleMaterial
    for (let i = upsampleRTs.length - 1; i >= 0; --i) {
      const renderTarget = upsampleRTs[i]
      const { width, height } = inputNode.value
      texelSize.value.set(1 / width, 1 / height)
      previousNode.value = downsampleRTs[i].texture
      renderer.setRenderTarget(renderTarget)
      mesh.render(renderer)
      inputNode.value = renderTarget.texture
    }

    RendererUtils.restoreRendererState(renderer, rendererState)

    inputNode.value = originalTexture
  }

  override setup(builder: NodeBuilder): unknown {
    const { inputNode, texelSize, previousNode } = this
    invariant(inputNode != null)

    const downsample = Fn(() => {
      const center = uv()
      const uv01 = vec2(-1, 1).mul(texelSize).add(center).toVertexStage()
      const uv02 = vec2(1, 1).mul(texelSize).add(center).toVertexStage()
      const uv03 = vec2(-1, -1).mul(texelSize).add(center).toVertexStage()
      const uv04 = vec2(1, -1).mul(texelSize).add(center).toVertexStage()
      const uv05 = vec2(-2, 2).mul(texelSize).add(center).toVertexStage()
      const uv06 = vec2(0, 2).mul(texelSize).add(center).toVertexStage()
      const uv07 = vec2(2, 2).mul(texelSize).add(center).toVertexStage()
      const uv08 = vec2(-2, 0).mul(texelSize).add(center).toVertexStage()
      const uv09 = vec2(2, 0).mul(texelSize).add(center).toVertexStage()
      const uv10 = vec2(-2, -2).mul(texelSize).add(center).toVertexStage()
      const uv11 = vec2(0, -2).mul(texelSize).add(center).toVertexStage()
      const uv12 = vec2(2, -2).mul(texelSize).add(center).toVertexStage()

      const innerWeight = 1 / 4 / 2
      const outerWeight = 1 / 9 / 2

      const result = inputNode.sample(center).mul(outerWeight)

      let weight: NodeObject
      weight = vec4(
        clampToBorder(uv01),
        clampToBorder(uv02),
        clampToBorder(uv03),
        clampToBorder(uv04)
      ).mul(innerWeight)

      result.addAssign(
        inputNode.sample(uv01).mul(weight.x),
        inputNode.sample(uv02).mul(weight.y),
        inputNode.sample(uv03).mul(weight.z),
        inputNode.sample(uv04).mul(weight.w)
      )

      weight = vec4(
        clampToBorder(uv05),
        clampToBorder(uv06),
        clampToBorder(uv07),
        clampToBorder(uv08)
      ).mul(outerWeight)

      result.addAssign(
        inputNode.sample(uv05).mul(weight.x),
        inputNode.sample(uv06).mul(weight.y),
        inputNode.sample(uv07).mul(weight.z),
        inputNode.sample(uv08).mul(weight.w)
      )

      weight = vec4(
        clampToBorder(uv09),
        clampToBorder(uv10),
        clampToBorder(uv11),
        clampToBorder(uv12)
      ).mul(outerWeight)

      result.addAssign(
        inputNode.sample(uv09).mul(weight.x),
        inputNode.sample(uv10).mul(weight.y),
        inputNode.sample(uv11).mul(weight.z),
        inputNode.sample(uv12).mul(weight.w)
      )

      return result
    })

    const upsample = Fn(() => {
      const center = uv()
      const uv1 = vec2(-1, 1).mul(texelSize).add(center).toVertexStage()
      const uv2 = vec2(0, 1).mul(texelSize).add(center).toVertexStage()
      const uv3 = vec2(1, 1).mul(texelSize).add(center).toVertexStage()
      const uv4 = vec2(-1, 0).mul(texelSize).add(center).toVertexStage()
      const uv5 = vec2(1, 0).mul(texelSize).add(center).toVertexStage()
      const uv6 = vec2(-1, -1).mul(texelSize).add(center).toVertexStage()
      const uv7 = vec2(0, -1).mul(texelSize).add(center).toVertexStage()
      const uv8 = vec2(1, -1).mul(texelSize).add(center).toVertexStage()

      const result = add(
        inputNode.sample(center).mul(0.25),
        add(
          inputNode.sample(uv2),
          inputNode.sample(uv4),
          inputNode.sample(uv5),
          inputNode.sample(uv7)
        ).mul(0.125),
        add(
          inputNode.sample(uv1),
          inputNode.sample(uv3),
          inputNode.sample(uv6),
          inputNode.sample(uv8)
        ).mul(0.0625)
      )
      return mix(previousNode.sample(center), result, 0.85)
    })

    const { downsampleMaterial, upsampleMaterial } = this
    downsampleMaterial.fragmentNode = downsample()
    upsampleMaterial.fragmentNode = upsample()
    downsampleMaterial.needsUpdate = true
    upsampleMaterial.needsUpdate = true

    this._textureNode.uvNode = inputNode.uvNode
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
