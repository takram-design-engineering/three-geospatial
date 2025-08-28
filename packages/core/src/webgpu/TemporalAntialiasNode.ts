import {
  ClampToEdgeWrapping,
  HalfFloatType,
  LinearFilter,
  Matrix4,
  RenderTarget,
  RGBAFormat,
  Vector2,
  type OrthographicCamera,
  type PerspectiveCamera,
  type Texture
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
  type TextureNode
} from 'three/webgpu'
import invariant from 'tiny-invariant'
import type { ArraySplice } from 'type-fest'

import { FnLayout } from './FnLayout'
import { FnVar } from './FnVar'
import type { Node, NodeObject } from './node'
import { outputTexture } from './OutputTextureNode'
import { textureCatmullRom } from './sampling'
import { isWebGPU } from './utils'

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
  ): Node<'vec4'> => {
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

export class TemporalAntialiasNode extends TempNode {
  static override get type(): string {
    return 'TemporalAntialiasNode'
  }

  velocityNodeImmutable: VelocityNodeImmutable

  inputNode?: TextureNode | null
  depthNode?: TextureNode | null
  velocityNode?: TextureNode | null
  camera?: PerspectiveCamera | OrthographicCamera | null
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
  private needsPostProcessingSync = false

  private readonly resolveNode = texture(this.resolveRT.texture)
  private readonly historyNode = texture(this.historyRT.texture)
  private readonly originalProjectionMatrix = new Matrix4()
  private jitterIndex = 0

  // WORKAROUND: The leading underscore avoids infinite recursion.
  // https://github.com/mrdoob/three.js/issues/31522
  private _textureNode?: TextureNode

  constructor(
    velocityNodeImmutable: VelocityNodeImmutable,
    inputNode?: TextureNode | null,
    depthNode?: TextureNode | null,
    velocityNode?: TextureNode | null,
    camera?: PerspectiveCamera | OrthographicCamera | null
  ) {
    super('vec4')
    this.velocityNodeImmutable = velocityNodeImmutable
    this.inputNode = inputNode
    this.depthNode = depthNode
    this.velocityNode = velocityNode
    this.camera = camera

    this.setOutputTexture(this.resolveRT.texture)

    this.updateBeforeType = NodeUpdateType.FRAME
  }

  protected createRenderTarget(name?: string): RenderTarget {
    let typeName = (this.constructor as typeof TemporalAntialiasNode).type
    typeName = typeName.endsWith('Node') ? typeName.slice(0, -4) : typeName

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
    texture.name = name != null ? `${typeName}.${name}` : typeName
    return renderTarget
  }

  getTextureNode(): TextureNode {
    invariant(
      this._textureNode != null,
      'outputNode must be specified by setOutputTexture() before getTextureNode() is called.'
    )
    return this._textureNode
  }

  protected setOutputTexture(value: Texture): this {
    this._textureNode = outputTexture(this, value)
    return this
  }

  setSize(width: number, height: number): this {
    const { resolutionScale } = this
    const w = Math.max(Math.round(width * resolutionScale), 1)
    const h = Math.max(Math.round(height * resolutionScale), 1)
    this.resolveRT.setSize(w, h)
    this.historyRT.setSize(w, h)
    return this
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

  private setViewOffset(camera: PerspectiveCamera | OrthographicCamera): void {
    // Store the unjittered projection matrix:
    camera.updateProjectionMatrix()
    this.originalProjectionMatrix.copy(camera.projectionMatrix)
    this.setProjectionMatrix(this.originalProjectionMatrix)

    const { width, height } = this.resolveRT // TODO
    const offset = bayerOffsets[this.jitterIndex]
    const dx = offset.x - 0.5
    const dy = offset.y - 0.5
    camera.setViewOffset(width, height, dx, dy, width, height)
  }

  private clearViewOffset(
    camera: PerspectiveCamera | OrthographicCamera
  ): void {
    // Reset the projection matrix modified in setViewOffset():
    camera.clearViewOffset()
    this.setProjectionMatrix(null)

    // setViewOffset() can be called multiple times in a frame. Increment the
    // jitter index here.
    this.jitterIndex = (this.jitterIndex + 1) % bayerOffsets.length
  }

  private swapBuffers(): void {
    // Swap the render target textures instead of copying:
    const { resolveRT, historyRT } = this
    this.resolveRT = historyRT
    this.historyRT = resolveRT
    this.resolveNode.value = historyRT.texture
    this.historyNode.value = resolveRT.texture

    // The output node must point to the current resolve.
    invariant(this._textureNode != null)
    this._textureNode.value = resolveRT.texture
  }

  override updateBefore({ renderer }: NodeFrame): void {
    if (renderer == null) {
      return
    }

    const { inputNode } = this
    invariant(inputNode != null)

    const { width, height } = inputNode.value
    this.setSize(width, height)

    if (this.needsPostProcessingSync) {
      invariant(this.camera != null)
      this.setViewOffset(this.camera)
      this.needsPostProcessingSync = false
    }

    this.rendererState = resetRendererState(renderer, this.rendererState)

    renderer.setRenderTarget(this.resolveRT)
    this.mesh.render(renderer)

    restoreRendererState(renderer, this.rendererState)

    // NOTE: Swapping the buffers in updateAfter() causes the render target
    // textures to be disposed unexpectedly.
    this.swapBuffers()
  }

  private setupOutputNode(): Node {
    const { inputNode, depthNode, velocityNode } = this
    invariant(inputNode != null)
    invariant(depthNode != null)
    invariant(velocityNode != null)

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
    const {
      inputNode,
      depthNode,
      velocityNode,
      camera,
      _textureNode: outputNode
    } = this
    invariant(
      inputNode != null,
      'inputNode must be specified before being setup.'
    )
    invariant(
      depthNode != null,
      'depthNode must be specified before being setup.'
    )
    invariant(
      velocityNode != null,
      'velocityNode must be specified before being setup.'
    )
    invariant(
      outputNode != null,
      'outputNode must be specified by setOutputTexture() before being setup.'
    )
    invariant(camera != null, 'Camera must be specified before being setup.')

    const { context } = (builder.getContext().postProcessing ??
      {}) as PostProcessingContext
    if (context != null) {
      this.needsPostProcessingSync = true

      const { onBeforePostProcessing, onAfterPostProcessing } = context
      context.onBeforePostProcessing = () => {
        onBeforePostProcessing?.()
        this.setViewOffset(camera)
      }
      context.onAfterPostProcessing = () => {
        onAfterPostProcessing?.()
        this.clearViewOffset(camera)
      }
    }

    // WORKAROUND: WebGLBackend seems to have issue with RTTNode. Disable it on
    // WebGLBackend for now.
    const { material } = this
    material.fragmentNode = isWebGPU(builder)
      ? this.setupOutputNode()
      : inputNode
    material.needsUpdate = true

    outputNode.uvNode = inputNode.uvNode
    return outputNode
  }

  override dispose(): void {
    this.resolveRT.dispose()
    this.historyRT.dispose()
    this.material.dispose()
    super.dispose()
  }
}

type Params = ConstructorParameters<typeof TemporalAntialiasNode>

export const temporalAntialias =
  (velocityNode: VelocityNodeImmutable) =>
  (...args: ArraySplice<Params, 0, 1>): NodeObject<TemporalAntialiasNode> =>
    nodeObject(new TemporalAntialiasNode(velocityNode, ...args))
