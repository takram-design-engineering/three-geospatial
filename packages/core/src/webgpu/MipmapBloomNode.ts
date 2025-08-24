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
  mix,
  nodeObject,
  texture,
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

import type { NodeObject } from './node'
import { outputTexture } from './OutputTextureNode'
import { clampToBorder } from './transformations'

function createRenderTarget(name: string): RenderTarget {
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
  texture.name = name
  return renderTarget
}

const sizeScratch = /*#__PURE__*/ new Vector2()

let rendererState: RendererUtils.RendererState

export class MipmapBloomNode extends TempNode {
  static override get type(): string {
    return 'MipmapBloomNode'
  }

  inputNode: TextureNode | null
  resolutionScale = 0.5

  private readonly downsampleRTs: RenderTarget[] = []
  private readonly upsampleRTs: RenderTarget[] = []
  private readonly downsampleMaterial = new NodeMaterial()
  private readonly upsampleMaterial = new NodeMaterial()
  private readonly mesh = new QuadMesh()

  private readonly texelSize = uniform(new Vector2())
  private readonly downsampleNode = texture(null)

  // WORKAROUND: The leading underscore avoids infinite recursion.
  // https://github.com/mrdoob/three.js/issues/31522
  private readonly _textureNode: TextureNode

  constructor(inputNode: TextureNode | null, levels = 8) {
    super('vec4')
    this.inputNode = inputNode

    for (let i = 0; i < levels; ++i) {
      this.downsampleRTs[i] = createRenderTarget(`MipmapBlur.Downsample${i}`)
      if (i < levels - 1) {
        this.upsampleRTs[i] = createRenderTarget(`MipmapBlur.Upsample${i}`)
      }
    }

    this._textureNode = outputTexture(this, this.upsampleRTs[0].texture)

    this.updateBeforeType = NodeUpdateType.FRAME
  }

  getTextureNode(): TextureNode {
    return this._textureNode
  }

  setSize(width: number, height: number): this {
    const { resolutionScale } = this
    let w = Math.max(Math.round(width * resolutionScale), 1)
    let h = Math.max(Math.round(height * resolutionScale), 1)

    const { downsampleRTs, upsampleRTs } = this
    for (let i = 0; i < downsampleRTs.length; ++i) {
      w = Math.max(Math.round(w / 2), 1)
      h = Math.max(Math.round(h / 2), 1)
      downsampleRTs[i].setSize(w, h)
      if (i < upsampleRTs.length) {
        upsampleRTs[i].setSize(w, h)
      }
    }
    return this
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
      downsampleNode
    } = this
    invariant(inputNode != null)

    const originalTexture = inputNode.value

    const size = renderer.getDrawingBufferSize(sizeScratch)
    this.setSize(size.width, size.height)

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
      downsampleNode.value = downsampleRTs[i].texture
      renderer.setRenderTarget(renderTarget)
      mesh.render(renderer)
      inputNode.value = renderTarget.texture
    }

    RendererUtils.restoreRendererState(renderer, rendererState)

    inputNode.value = originalTexture
  }

  override setup(builder: NodeBuilder): unknown {
    const { inputNode, texelSize, downsampleNode } = this
    invariant(inputNode != null)

    const downsample = Fn(() => {
      const center = uv()
      const offset1 = vec4(1, 1, -1, -1).mul(texelSize.xyxy).add(center.xyxy)
      const offset2 = vec4(2, 2, -2, -2).mul(texelSize.xyxy).add(center.xyxy)
      const uv01 = offset1.zy.toVertexStage()
      const uv02 = offset1.xy.toVertexStage()
      const uv03 = offset1.zw.toVertexStage()
      const uv04 = offset1.xw.toVertexStage()
      const uv05 = offset2.zy.toVertexStage()
      const uv06 = offset2.xy.toVertexStage()
      const uv07 = offset2.zw.toVertexStage()
      const uv08 = offset2.xw.toVertexStage()
      const uv09 = vec2(center.x, offset2.y).toVertexStage()
      const uv10 = vec2(offset2.z, center.y).toVertexStage()
      const uv11 = vec2(offset2.x, center.y).toVertexStage()
      const uv12 = vec2(center.x, offset2.w).toVertexStage()

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
      const offset = vec4(1, 1, -1, -1).mul(texelSize.xyxy).add(center.xyxy)
      const uv1 = vec2(center.x, offset.y).toVertexStage()
      const uv2 = vec2(offset.z, center.y).toVertexStage()
      const uv3 = vec2(offset.x, center.y).toVertexStage()
      const uv4 = vec2(center.x, offset.w).toVertexStage()
      const uv5 = offset.zy.toVertexStage()
      const uv6 = offset.xy.toVertexStage()
      const uv7 = offset.zw.toVertexStage()
      const uv8 = offset.xw.toVertexStage()

      const result = add(
        inputNode.sample(center).mul(0.25),
        add(
          inputNode.sample(uv1),
          inputNode.sample(uv2),
          inputNode.sample(uv3),
          inputNode.sample(uv4)
        ).mul(0.125),
        add(
          inputNode.sample(uv5),
          inputNode.sample(uv6),
          inputNode.sample(uv7),
          inputNode.sample(uv8)
        ).mul(0.0625)
      )
      return mix(downsampleNode.sample(center), result, 0.85)
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

export const mipmapBloom = (
  ...args: ConstructorParameters<typeof MipmapBloomNode>
): NodeObject<MipmapBloomNode> => nodeObject(new MipmapBloomNode(...args))
