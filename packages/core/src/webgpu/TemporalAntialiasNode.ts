import {
  ClampToEdgeWrapping,
  HalfFloatType,
  LinearFilter,
  Matrix4,
  RenderTarget,
  RGBAFormat,
  Vector2,
  type OrthographicCamera,
  type PerspectiveCamera
} from 'three'
import {
  float,
  Fn,
  If,
  ivec2,
  max,
  mix,
  nodeObject,
  screenCoordinate,
  screenUV,
  select,
  sqrt,
  struct,
  texture,
  uniform,
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
  type Renderer,
  type TextureNode
} from 'three/webgpu'

import { FnLayout } from './FnLayout'
import { FnVar } from './FnVar'
import type { Node, NodeObject } from './node'
import { convertToTexture } from './RenderTargetNode'
import { textureCatmullRom } from './sampling'

const { resetRendererState, restoreRendererState } = RendererUtils

interface PostProcessingContext {
  context?: {
    onBeforePostProcessing?: () => void
    onAfterPostProcessing?: () => void
  }
}

interface VelocityNodeImmutable {
  projectionMatrix?: Matrix4 | null
  setProjectionMatrix?: (value: Matrix4 | null) => unknown
}

// prettier-ignore
const bayerIndices: readonly number[] = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5
]

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const bayerOffsets: readonly Vector2[] = /*#__PURE__*/ bayerIndices.reduce<
  Vector2[]
>((result, _, index) => {
  const offset = new Vector2()
  for (let i = 0; i < 16; ++i) {
    if (bayerIndices[i] === index) {
      offset.set(((i % 4) + 0.5) / 4, (Math.floor(i / 4) + 0.5) / 4)
      break
    }
  }
  return [...result, offset]
}, [])

function halton(index: number, base: number): number {
  let fraction = 1
  let result = 0
  while (index > 0) {
    fraction /= base
    result += fraction * (index % base)
    index = Math.floor(index / base)
  }
  return result
}

const haltonOffsets: readonly Vector2[] = /*#__PURE__*/ Array.from(
  { length: 16 },
  (_, index) => new Vector2(halton(index + 1, 2), halton(index + 1, 3))
)

// Reference: https://github.com/playdeadgames/temporal
const clipAABB = /*#__PURE__*/ FnLayout({
  name: 'clipAABB',
  type: 'vec4',
  inputs: [
    { name: 'current', type: 'vec4' },
    { name: 'history', type: 'vec4' },
    { name: 'minColor', type: 'vec4' },
    { name: 'maxColor', type: 'vec4' }
  ]
})(([current, history, minColor, maxColor]) => {
  const pClip = maxColor.rgb.add(minColor.rgb).mul(0.5)
  const eClip = maxColor.rgb.sub(minColor.rgb).mul(0.5).add(1e-7)
  const vClip = history.sub(vec4(pClip, current.a))
  const vUnit = vClip.xyz.div(eClip)
  const absUnit = vUnit.abs()
  const maxUnit = max(absUnit.x, absUnit.y, absUnit.z)
  return select(
    maxUnit.greaterThan(1),
    vec4(pClip, current.a).add(vClip.div(maxUnit)),
    history
  )
})

const varianceOffsets = [
  /*#__PURE__*/ ivec2(-1, -1),
  /*#__PURE__*/ ivec2(-1, 1),
  /*#__PURE__*/ ivec2(1, -1),
  /*#__PURE__*/ ivec2(1, 1),
  /*#__PURE__*/ ivec2(1, 0),
  /*#__PURE__*/ ivec2(0, -1),
  /*#__PURE__*/ ivec2(0, 1),
  /*#__PURE__*/ ivec2(-1, 0)
]

const varianceClipping = /*#__PURE__*/ FnVar(
  (
    inputNode: TextureNode,
    coord: NodeObject<'ivec2'>,
    current: NodeObject<'vec4'>,
    history: NodeObject<'vec4'>,
    gamma: NodeObject<'float'>
  ): NodeObject<'vec4'> => {
    const moment1 = current.toVar()
    const moment2 = current.pow2().toVar()

    for (const offset of varianceOffsets) {
      // TODO: Use offset()
      const neighbor = inputNode.load(coord.add(offset))
      moment1.addAssign(neighbor)
      moment2.addAssign(neighbor.pow2())
    }

    const N = float(varianceOffsets.length + 1)
    const mean = moment1.div(N)
    const variance = sqrt(moment2.div(N).sub(mean.pow2()).max(0)).mul(gamma)
    const minColor = mean.sub(variance)
    const maxColor = mean.add(variance)

    return clipAABB(mean.clamp(minColor, maxColor), history, minColor, maxColor)
  }
)

const neighborOffsets = [
  /*#__PURE__*/ ivec2(-1, -1),
  /*#__PURE__*/ ivec2(-1, 0),
  /*#__PURE__*/ ivec2(-1, 1),
  /*#__PURE__*/ ivec2(0, -1),
  /*#__PURE__*/ ivec2(0, 0),
  /*#__PURE__*/ ivec2(0, 1),
  /*#__PURE__*/ ivec2(1, -1),
  /*#__PURE__*/ ivec2(1, 0),
  /*#__PURE__*/ ivec2(1, 1)
]

const closetDepthStruct = /*#__PURE__*/ struct({
  coord: 'ivec2',
  depth: 'float'
})

const getClosestDepth = /*#__PURE__*/ FnVar(
  (depthNode: TextureNode, inputCoord: NodeObject<'ivec2'>) => {
    const depth = float(1)
    const coord = ivec2(0)
    for (const offset of neighborOffsets) {
      // TODO: Use offset()
      const offsetCoord = inputCoord.add(offset).toConst()
      const neighbor = depthNode.load(offsetCoord).toConst()
      If(neighbor.r.lessThan(depth), () => {
        coord.assign(offsetCoord)
        depth.assign(neighbor.r)
      })
    }
    return closetDepthStruct(coord, depth)
  }
)

const sizeScratch = /*#__PURE__*/ new Vector2()

// Note on TAA and tone mapping (p.19):
// https://advances.realtimerendering.com/s2014/epic/TemporalAA.pptx
export class TemporalAntialiasNode extends TempNode {
  static override get type(): string {
    return 'TemporalAntialiasNode'
  }

  velocityNodeImmutable: VelocityNodeImmutable

  inputNode: TextureNode
  depthNode: TextureNode
  velocityNode: TextureNode
  camera: PerspectiveCamera | OrthographicCamera
  resolutionScale = 1 // TODO

  temporalAlpha = uniform(0.1)
  varianceGamma = uniform(1)

  // Static options:
  showDisocclusion = false

  private resolveRT = this.createRenderTarget('Resolve')
  private historyRT = this.createRenderTarget('History')
  private readonly material = new NodeMaterial()
  private readonly mesh = new QuadMesh(this.material)
  private rendererState!: RendererUtils.RendererState
  private needsClearHistory = false

  private readonly resolveNode = texture(this.resolveRT.texture)
  private readonly historyNode = texture(this.historyRT.texture)
  private readonly originalProjectionMatrix = new Matrix4()
  private jitterIndex = 0

  // WORKAROUND: The leading underscore avoids infinite recursion.
  // https://github.com/mrdoob/three.js/issues/31522
  private readonly _textureNode: TextureNode

  constructor(
    velocityNodeImmutable: VelocityNodeImmutable,
    inputNode: TextureNode,
    depthNode: TextureNode,
    velocityNode: TextureNode,
    camera: PerspectiveCamera | OrthographicCamera
  ) {
    super('vec4')
    this.velocityNodeImmutable = velocityNodeImmutable
    this.inputNode = inputNode
    this.depthNode = depthNode
    this.velocityNode = velocityNode
    this.camera = camera

    this._textureNode = texture(this.resolveRT.texture)

    this.updateBeforeType = NodeUpdateType.FRAME
  }

  private createRenderTarget(name?: string): RenderTarget {
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

    const typeName = (this.constructor as typeof TemporalAntialiasNode).type
    texture.name = name != null ? `${typeName}.${name}` : typeName

    return renderTarget
  }

  private setProjectionMatrix(value: Matrix4 | null): void {
    const { velocityNodeImmutable: velocity } = this
    if (velocity != null) {
      if ('setProjectionMatrix' in velocity) {
        velocity.setProjectionMatrix?.(value)
      } else {
        velocity.projectionMatrix = value
      }
    }
  }

  setSize(width: number, height: number): this {
    const { resolutionScale } = this
    const w = Math.max(Math.round(width * resolutionScale), 1)
    const h = Math.max(Math.round(height * resolutionScale), 1)

    const { resolveRT, historyRT } = this
    if (w !== historyRT.width || h !== historyRT.height) {
      resolveRT.setSize(w, h)
      historyRT.setSize(w, h)
      this.needsClearHistory = true
    }
    return this
  }

  private clearHistory(renderer: Renderer, inputNode: TextureNode): void {
    // Bind and clear the history render target to make sure it's initialized
    // after the resize which triggers a dispose().
    renderer.setRenderTarget(this.resolveRT)
    void renderer.clear()
    renderer.setRenderTarget(this.historyRT)
    void renderer.clear()

    // Copy the current input to the history with scaling.
    renderer.setRenderTarget(this.historyRT)
    const fragmentNode = this.material.fragmentNode
    this.material.fragmentNode = inputNode
    this.material.needsUpdate = true
    this.mesh.render(renderer)
    this.material.fragmentNode = fragmentNode
    this.material.needsUpdate = true

    this.needsClearHistory = false
  }

  private setViewOffset(width: number, height: number): void {
    // Store the unjittered projection matrix:
    const { camera } = this
    camera.updateProjectionMatrix()
    this.originalProjectionMatrix.copy(camera.projectionMatrix)
    this.setProjectionMatrix(this.originalProjectionMatrix)

    const offset = haltonOffsets[this.jitterIndex]
    const dx = offset.x - 0.5
    const dy = offset.y - 0.5
    camera.setViewOffset(width, height, dx, dy, width, height)
  }

  private clearViewOffset(): void {
    // Reset the projection matrix modified in setViewOffset():
    this.camera.clearViewOffset()
    this.setProjectionMatrix(null)

    // setViewOffset() can be called multiple times in a frame. Increment the
    // jitter index here.
    this.jitterIndex = (this.jitterIndex + 1) % haltonOffsets.length
  }

  private swapBuffers(): void {
    // Swap the render target textures instead of copying:
    const { resolveRT, historyRT } = this
    this.resolveRT = historyRT
    this.historyRT = resolveRT
    this.resolveNode.value = historyRT.texture
    this.historyNode.value = resolveRT.texture

    // The output node must point to the current resolve.
    this._textureNode.value = resolveRT.texture
  }

  override updateBefore({ renderer }: NodeFrame): void {
    if (renderer == null) {
      return
    }

    const size = renderer.getDrawingBufferSize(sizeScratch)
    this.setSize(size.x, size.y)

    this.rendererState = resetRendererState(renderer, this.rendererState)

    if (this.needsClearHistory) {
      this.clearHistory(renderer, this.inputNode)
    }

    renderer.setRenderTarget(this.resolveRT)
    this.mesh.render(renderer)

    restoreRendererState(renderer, this.rendererState)

    this.swapBuffers()
  }

  private setupOutputNode(): Node {
    const { inputNode, depthNode, velocityNode } = this

    // TODO: Add confidence
    return Fn(() => {
      const coord = ivec2(screenCoordinate)
      const uv = screenUV

      const currentColor = inputNode.load(coord).toConst()
      const closestDepth = getClosestDepth(depthNode, coord)
      const closestCoord = closestDepth.get('coord')

      const velocity = velocityNode
        .load(closestCoord)
        // Convert NDC velocity to UV offset:
        // TODO: Should Y be inverted on WebGPU?
        .xy.mul(vec2(0.5, -0.5))

      const outputColor = vec4(0).toVar()
      const prevUV = uv.sub(velocity).toConst()

      If(prevUV.lessThan(0).any().or(prevUV.greaterThan(1).any()), () => {
        // An obvious disocclusion:
        outputColor.assign(currentColor)
        if (this.showDisocclusion) {
          outputColor.assign(vec3(1, 0, 0))
        }
      }).Else(() => {
        const historyColor = textureCatmullRom(this.historyNode, prevUV)
        const clippedColor = varianceClipping(
          inputNode,
          coord,
          currentColor,
          historyColor,
          this.varianceGamma
        )
        outputColor.assign(mix(clippedColor, currentColor, this.temporalAlpha))
      })
      return outputColor
    })()
  }

  override setup(builder: NodeBuilder): unknown {
    const { inputNode } = this

    const { context } = (builder.getContext().postProcessing ??
      {}) as PostProcessingContext
    if (context != null) {
      const { onBeforePostProcessing, onAfterPostProcessing } = context
      context.onBeforePostProcessing = () => {
        onBeforePostProcessing?.()
        const size = builder.renderer.getDrawingBufferSize(sizeScratch)
        this.setViewOffset(size.width, size.height)
      }
      context.onAfterPostProcessing = () => {
        onAfterPostProcessing?.()
        this.clearViewOffset()
      }
    }

    const { material } = this
    material.fragmentNode = this.setupOutputNode()
    material.needsUpdate = true

    this._textureNode.uvNode = inputNode.uvNode
    return this._textureNode
  }

  override dispose(): void {
    this.resolveRT.dispose()
    this.historyRT.dispose()
    this.material.dispose()
    super.dispose()
  }
}

export const temporalAntialias =
  (velocityNodeImmutable: VelocityNodeImmutable) =>
  (
    inputNode: Node,
    depthNode: TextureNode,
    velocityNode: TextureNode,
    camera: PerspectiveCamera | OrthographicCamera
  ): NodeObject<TemporalAntialiasNode> =>
    nodeObject(
      new TemporalAntialiasNode(
        velocityNodeImmutable,
        convertToTexture(inputNode),
        depthNode,
        velocityNode,
        camera
      )
    )
