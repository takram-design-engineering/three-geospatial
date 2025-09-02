import {
  DepthTexture,
  HalfFloatType,
  LinearFilter,
  Matrix4,
  RenderTarget,
  RGBAFormat,
  Vector2,
  type Camera
} from 'three'
import {
  and,
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
  step,
  struct,
  texture,
  uniform,
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

import { cameraFar, cameraNear } from './accessors'
import { FnLayout } from './FnLayout'
import { FnVar } from './FnVar'
import { haltonOffsets } from './internals'
import type { Node, NodeObject } from './node'
import { outputTexture } from './OutputTextureNode'
import { convertToTexture } from './RenderTargetNode'
import { textureCatmullRom } from './sampling'
import { logarithmicDepthToPerspectiveDepth } from './transformations'

const { resetRendererState, restoreRendererState } = RendererUtils

interface VelocityNodeImmutable {
  projectionMatrix?: Matrix4 | null
  setProjectionMatrix?: (value: Matrix4 | null) => unknown
}

interface SupportedCamera extends Camera {
  updateProjectionMatrix(): void
  setViewOffset(
    fullWidth: number,
    fullHeight: number,
    x: number,
    y: number,
    width: number,
    height: number
  ): void
  clearViewOffset(): void
}

function isSupportedCamera(camera: Camera): camera is SupportedCamera {
  return (
    camera.isPerspectiveCamera === true ||
    camera.isOrthographicCamera === true ||
    ('updateProjectionMatrix' in camera &&
      'setViewOffset' in camera &&
      'clearViewOffset' in camera)
  )
}

interface PostProcessingContext {
  context?: {
    onBeforePostProcessing?: () => void
    onAfterPostProcessing?: () => void
  }
}

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
const emptyDepthTexture = /*#__PURE__*/ new DepthTexture(1, 1)

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
  camera: SupportedCamera

  temporalAlpha = uniform(0.1)
  varianceGamma = uniform(1)
  velocityThreshold = uniform(0.1)
  depthError = uniform(0.001)

  // Static options:
  debugShowDisocclusion = false

  private resolveRT = this.createRenderTarget('Resolve')
  private historyRT = this.createRenderTarget('History')
  private previousDepthTexture?: DepthTexture
  private readonly material = new NodeMaterial()
  private readonly copyMaterial = new NodeMaterial()
  private readonly mesh = new QuadMesh(this.material)
  private rendererState!: RendererUtils.RendererState
  private needsClearHistory = false

  private readonly resolveNode = texture(this.resolveRT.texture)
  private readonly historyNode = texture(this.historyRT.texture)
  private readonly previousDepthNode = texture(emptyDepthTexture)
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
    camera: Camera
  ) {
    super('vec4')
    this.velocityNodeImmutable = velocityNodeImmutable
    this.inputNode = inputNode
    this.depthNode = depthNode
    this.velocityNode = velocityNode
    if (!isSupportedCamera(camera)) {
      throw new Error('The provided camera is not supported.')
    }
    this.camera = camera

    this._textureNode = outputTexture(this, this.resolveRT.texture)

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
    texture.generateMipmaps = false

    const typeName = (this.constructor as typeof TemporalAntialiasNode).type
    texture.name = name != null ? `${typeName}.${name}` : typeName

    return renderTarget
  }

  getTextureNode(): TextureNode {
    return this._textureNode
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
    const { resolveRT, historyRT } = this
    if (width !== historyRT.width || height !== historyRT.height) {
      resolveRT.setSize(width, height)
      historyRT.setSize(width, height)
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
    this.mesh.material = this.copyMaterial
    this.mesh.render(renderer)
    this.mesh.material = this.material

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

  private copyDepthTexture(renderer: Renderer): void {
    const current = this.depthNode.value
    const previous = (this.previousDepthTexture ??=
      current.clone() as DepthTexture)
    previous.image.width = current.width
    previous.image.height = current.height
    previous.needsUpdate = true
    renderer.copyTextureToTexture(current, previous)

    this.previousDepthNode.value = previous
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

    this.copyDepthTexture(renderer)
    this.swapBuffers()
  }

  private setupOutputNode({ renderer }: NodeBuilder): Node {
    const getPreviousDepth = (uv: NodeObject<'vec2'>): NodeObject<'float'> => {
      const { previousDepthNode: depthNode } = this
      const depth = depthNode
        .load(uv.mul(depthNode.size(0)).sub(0.5).floor()) // BUG: Cannot use ivec2
        .toConst()
      return renderer.logarithmicDepthBuffer
        ? logarithmicDepthToPerspectiveDepth(
            depth,
            cameraNear(this.camera),
            cameraFar(this.camera)
          )
        : depth
    }

    return Fn(() => {
      const coord = ivec2(screenCoordinate)
      const uv = screenUV

      const currentColor = this.inputNode.load(coord).toConst()
      const closestDepth = getClosestDepth(this.depthNode, coord)
      const closestCoord = closestDepth.get('coord')

      const velocity = this.velocityNode
        .load(closestCoord)
        // Convert NDC velocity to UV and depth offset:
        // TODO: Should Y be inverted on WebGPU?
        .xyz.mul(vec3(0.5, -0.5, 0.5))

      // Discards texels with velocity greater than the threshold:
      const velocityConfidence = velocity.xy
        .length()
        .div(this.velocityThreshold)
        .oneMinus()
        .saturate()

      const prevUV = uv.sub(velocity.xy).toConst()
      const prevDepth = getPreviousDepth(prevUV)

      // TODO: Add gather() in TextureNode and use it:
      let expectedDepth = closestDepth.get('depth')
      if (renderer.logarithmicDepthBuffer) {
        expectedDepth = logarithmicDepthToPerspectiveDepth(
          expectedDepth,
          cameraNear(this.camera),
          cameraFar(this.camera)
        )
      }

      expectedDepth = expectedDepth.add(velocity.z)
      const depthConfidence = step(
        expectedDepth,
        prevDepth.add(this.depthError)
      )
      const confidence = velocityConfidence.mul(depthConfidence)

      const uvWeight = and(
        prevUV.greaterThanEqual(0).all(),
        prevUV.lessThanEqual(1).all()
      ).toFloat()

      const outputColor = vec4(0).toVar()
      If(uvWeight.mul(confidence).greaterThan(0), () => {
        const historyColor = textureCatmullRom(this.historyNode, prevUV)
        const clippedColor = varianceClipping(
          this.inputNode,
          coord,
          currentColor,
          historyColor,
          this.varianceGamma
        )
        // TODO: Use confidence in alpha:
        outputColor.assign(mix(clippedColor, currentColor, this.temporalAlpha))
      }).Else(() => {
        outputColor.assign(currentColor)
        if (this.debugShowDisocclusion) {
          outputColor.assign(vec3(1, 0, 0))
        }
      })

      return outputColor
    })()
  }

  override setup(builder: NodeBuilder): unknown {
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

    const { material, copyMaterial } = this
    material.fragmentNode = this.setupOutputNode(builder)
    material.needsUpdate = true

    copyMaterial.fragmentNode = this.inputNode
    copyMaterial.needsUpdate = true

    this._textureNode.uvNode = this.inputNode.uvNode
    return this._textureNode
  }

  override dispose(): void {
    this.resolveRT.dispose()
    this.historyRT.dispose()
    this.previousDepthTexture?.dispose()
    this.material.dispose()
    this.copyMaterial.dispose()
    super.dispose()
  }
}

export const temporalAntialias =
  (velocityNodeImmutable: VelocityNodeImmutable) =>
  (
    inputNode: Node,
    depthNode: TextureNode,
    velocityNode: TextureNode,
    camera: Camera
  ): NodeObject<TemporalAntialiasNode> =>
    nodeObject(
      new TemporalAntialiasNode(
        velocityNodeImmutable,
        convertToTexture(inputNode, 'TemporalAntialias'),
        depthNode,
        velocityNode,
        camera
      )
    )
