import {
  ClampToEdgeWrapping,
  HalfFloatType,
  LinearFilter,
  RenderTarget,
  RGBAFormat,
  Vector2
} from 'three'
import {
  abs,
  add,
  distance,
  float,
  fract,
  min,
  mul,
  nodeObject,
  sub,
  uniform,
  uv,
  vec2,
  vec3,
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

import { FnLayout } from './FnLayout'
import type { NodeObject } from './node'
import { outputTexture } from './OutputTextureNode'

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

export class LensFlareFeaturesNode extends TempNode {
  static override get type(): string {
    return 'LensFlareFeaturesNode'
  }

  inputNode: TextureNode | null
  ghostAmount = uniform(1e-5)
  haloAmount = uniform(1e-5)
  chromaticAberration = uniform(10)
  resolutionScale = 0.5

  private readonly renderTarget = createRenderTarget('LensFlareFeatures')
  private readonly material = new NodeMaterial()
  private readonly mesh = new QuadMesh(this.material)

  private readonly texelSize = uniform(new Vector2())
  private readonly aspectRatio = uniform(0)

  // WORKAROUND: The leading underscore avoids infinite recursion.
  // https://github.com/mrdoob/three.js/issues/31522
  private readonly _textureNode: TextureNode

  constructor(inputNode: TextureNode | null) {
    super('vec4')
    this.inputNode = inputNode

    this._textureNode = outputTexture(this, this.renderTarget.texture)

    this.updateBeforeType = NodeUpdateType.FRAME
  }

  getTextureNode(): TextureNode {
    return this._textureNode
  }

  setSize(width: number, height: number): this {
    const { resolutionScale } = this
    const w = Math.max(Math.round(width * resolutionScale), 1)
    const h = Math.max(Math.round(height * resolutionScale), 1)
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
    this.aspectRatio.value = width / height
    renderer.setRenderTarget(this.renderTarget)
    this.mesh.render(renderer)

    RendererUtils.restoreRendererState(renderer, rendererState)
  }

  override setup(builder: NodeBuilder): unknown {
    const {
      inputNode,
      ghostAmount,
      haloAmount,
      chromaticAberration,
      texelSize,
      aspectRatio
    } = this
    invariant(inputNode != null)

    const sampleGhost = FnLayout({
      name: 'sampleGhost',
      type: 'vec3',
      inputs: [
        { name: 'uv', type: 'vec2' },
        { name: 'direction', type: 'vec2' },
        { name: 'color', type: 'vec3' },
        { name: 'offset', type: 'float' }
      ]
    })(([uv, direction, color, offset]) => {
      const suv = direction.mul(offset).add(uv.oneMinus()).saturate()
      const result = inputNode.sample(suv).rgb.mul(color)

      // Falloff at the perimeter:
      const sqrt2 = float(Math.SQRT2)
      const d = sub(0.5, suv).length().div(sqrt2.mul(0.25)).saturate()
      result.mulAssign(d.oneMinus().pow(3))
      return result
    })

    const sampleGhosts = FnLayout({
      name: 'sampleGhosts',
      type: 'vec4',
      inputs: [
        { name: 'uv', type: 'vec2' },
        { name: 'amount', type: 'float' }
      ]
    })(([uv, amount]) => {
      const color = vec3(0)
      const direction = uv.sub(0.5)
      color.addAssign(sampleGhost(uv, direction, vec3(0.8, 0.8, 1), -5.0))
      color.addAssign(sampleGhost(uv, direction, vec3(1, 0.8, 0.4), -1.5))
      color.addAssign(sampleGhost(uv, direction, vec3(0.9, 1, 0.8), -0.4))
      color.addAssign(sampleGhost(uv, direction, vec3(1, 0.8, 0.4), -0.2))
      color.addAssign(sampleGhost(uv, direction, vec3(0.9, 0.7, 0.7), -0.1))
      color.addAssign(sampleGhost(uv, direction, vec3(0.5, 1, 0.4), 0.7))
      color.addAssign(sampleGhost(uv, direction, vec3(0.5, 0.5, 0.5), 1))
      color.addAssign(sampleGhost(uv, direction, vec3(1, 1, 0.6), 2.5))
      color.addAssign(sampleGhost(uv, direction, vec3(0.5, 0.8, 1), 10))
      return vec4(color.mul(amount), 1)
    })

    const cubicRingMask = FnLayout({
      name: 'cubicRingMask',
      type: 'float',
      inputs: [
        { name: 'x', type: 'float' },
        { name: 'radius', type: 'float' },
        { name: 'thickness', type: 'float' }
      ]
    })(([x, radius, thickness]) => {
      const v = min(abs(x.sub(radius)).div(thickness), 1)
      return mul(v, v, sub(3, v.mul(2))).oneMinus()
    })

    const sampleHalo = FnLayout({
      name: 'sampleHalo',
      type: 'vec3',
      inputs: [
        { name: 'uv', type: 'vec2' },
        { name: 'radius', type: 'float' }
      ]
    })(([uv, radius]) => {
      const scale = vec2(aspectRatio, 1)
      const direction = uv.sub(0.5).mul(scale).normalize().div(scale)
      const offset = vec3(texelSize.x.mul(chromaticAberration)).mul(
        vec3(-1, 0, 1)
      )
      const suv = fract(direction.mul(radius).add(uv.oneMinus()))
      const result = vec3(
        inputNode.sample(direction.mul(offset.r).add(suv)).r,
        inputNode.sample(direction.mul(offset.g).add(suv)).g,
        inputNode.sample(direction.mul(offset.b).add(suv)).b
      )

      // Falloff at the center and perimeter:
      const wuv = uv.sub(vec2(0.5, 0)).mul(scale).add(vec2(0.5, 0))
      const d = distance(wuv, vec2(0.5)).saturate()
      result.mulAssign(cubicRingMask(d, 0.45, 0.25))
      return result
    })

    const sampleHalos = FnLayout({
      name: 'sampleHalos',
      type: 'vec4',
      inputs: [
        { name: 'uv', type: 'vec2' },
        { name: 'amount', type: 'float' }
      ]
    })(([uv, amount]) => {
      const color = vec3(0)
      color.addAssign(sampleHalo(uv, 0.3))
      return vec4(color.mul(amount), 1)
    })

    const { material } = this
    material.fragmentNode = add(
      sampleGhosts(uv(), ghostAmount),
      sampleHalos(uv(), haloAmount)
    )
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

export const lensFlareFeatures = (
  ...args: ConstructorParameters<typeof LensFlareFeaturesNode>
): NodeObject<LensFlareFeaturesNode> =>
  nodeObject(new LensFlareFeaturesNode(...args))
