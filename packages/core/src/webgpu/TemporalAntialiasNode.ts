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
import { hash } from 'three/src/nodes/core/NodeUtils.js'
import {
  and,
  float,
  Fn,
  If,
  ivec2,
  max,
  mix,
  screenCoordinate,
  screenSize,
  screenUV,
  select,
  sqrt,
  step,
  struct,
  texture,
  textureSize,
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
import type { Node } from './node'
import { outputTexture } from './OutputTextureNode'
import { convertToTexture } from './RTTextureNode'
import { logarithmicToPerspectiveDepth } from './transformations'
import { isWebGPU } from './utils'

const { resetRendererState, restoreRendererState } = RendererUtils

interface VelocityNodeImmutable {
  projectionMatrix?: Matrix4 | null
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
    coord: Node<'ivec2'>,
    current: Node<'vec4'>,
    history: Node<'vec4'>,
    gamma: Node<'float'>
  ): Node<'vec4'> => {
    const moment1 = current.toVar()
    const moment2 = current.pow2().toVar()

    for (const offset of varianceOffsets) {
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

const closestDepthStruct = /*#__PURE__*/ struct({
  coord: 'ivec2',
  depth: 'float'
})

const getClosestDepth = /*#__PURE__*/ FnVar(
  (depthNode: TextureNode, inputCoord: Node<'ivec2'>) => {
    const depth = float(1)
    const coord = ivec2(0)
    for (const offset of neighborOffsets) {
      const offsetCoord = inputCoord.add(offset).toVar()
      const neighbor = depthNode.load(offsetCoord).toVar()
      If(neighbor.r.lessThan(depth), () => {
        coord.assign(offsetCoord)
        depth.assign(neighbor.r)
      })
    }
    return closestDepthStruct(coord, depth)
  }
)

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const reinhard = /*#__PURE__*/ FnLayout({
  name: 'reinhard',
  type: 'vec4',
  inputs: [
    { name: 'input', type: 'vec4' },
    { name: 'exposure', type: 'float' }
  ]
})(([input, exposure]) => {
  const color = input.rgb.mul(exposure)
  return vec4(color.div(color.add(1)).saturate(), input.a)
})

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const inverseReinhard = /*#__PURE__*/ FnLayout({
  name: 'inverseReinhard',
  type: 'vec4',
  inputs: [
    { name: 'input', type: 'vec4' },
    { name: 'exposure', type: 'float' }
  ]
})(([input, exposure]) => {
  const color = input.rgb
  return vec4(color.div(exposure.mul(color.oneMinus().max(1e-8))), input.a)
})

const sizeScratch = /*#__PURE__*/ new Vector2()
const emptyDepthTexture = /*#__PURE__*/ new DepthTexture(1, 1)

// Note on TAA and tone mapping (p.19):
// https://advances.realtimerendering.com/s2014/epic/TemporalAA.pptx
export class TemporalAntialiasNode extends TempNode {
  static override get type(): string {
    return 'TemporalAntialiasNode'
  }

  private readonly velocityNodeImmutable: VelocityNodeImmutable

  inputNode: TextureNode
  depthNode: TextureNode
  velocityNode: TextureNode
  camera: SupportedCamera

  temporalAlpha = uniform(0.05)
  varianceGamma = uniform(1)
  velocityThreshold = uniform(0.1)
  depthError = uniform(0.001)

  // Static options:
  debugShowRejection = false

  private readonly textureNode: TextureNode

  private resolveRT = this.createRenderTarget('Resolve')
  private historyRT = this.createRenderTarget('History')
  private previousDepthTexture?: DepthTexture
  private readonly resolveMaterial = new NodeMaterial()
  private readonly copyMaterial = new NodeMaterial()
  private readonly mesh = new QuadMesh()
  private rendererState?: RendererUtils.RendererState
  private needsSyncPostProcessing = false
  private needsClearHistory = false

  private readonly resolveNode = texture(this.resolveRT.texture)
  private readonly historyNode = texture(this.historyRT.texture)
  private readonly previousDepthNode = texture(emptyDepthTexture)
  private readonly originalProjectionMatrix = new Matrix4()
  private jitterIndex = 0

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

    this.textureNode = outputTexture(this, this.resolveRT.texture)

    this.updateBeforeType = NodeUpdateType.FRAME
  }

  override customCacheKey(): number {
    return hash(this.camera.id, +this.debugShowRejection)
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
    return this.textureNode
  }

  private setProjectionMatrix(value: Matrix4 | null): void {
    const { velocityNodeImmutable: velocity } = this
    if (velocity != null) {
      velocity.projectionMatrix = value
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

  private clearHistory(renderer: Renderer): void {
    // Bind and clear the history render target to make sure it's initialized
    // after the resize which triggers a dispose().
    renderer.setRenderTarget(this.resolveRT)
    renderer.clear()
    renderer.setRenderTarget(this.historyRT)
    renderer.clear()

    // Copy the current input to the history with scaling.
    renderer.setRenderTarget(this.historyRT)
    this.mesh.material = this.copyMaterial
    this.mesh.render(renderer)

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

    if (
      previous.image.width !== current.width ||
      previous.image.height !== current.height
    ) {
      previous.image.width = current.width
      previous.image.height = current.height
      previous.needsUpdate = true
    }
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
    this.textureNode.value = resolveRT.texture
  }

  override updateBefore({ renderer }: NodeFrame): void {
    if (renderer == null) {
      return
    }

    const size = renderer.getDrawingBufferSize(sizeScratch)
    this.setSize(size.x, size.y)

    this.rendererState = resetRendererState(renderer, this.rendererState)

    if (this.needsClearHistory) {
      this.clearHistory(renderer)
    }

    renderer.setRenderTarget(this.resolveRT)
    this.mesh.material = this.resolveMaterial
    this.mesh.render(renderer)

    restoreRendererState(renderer, this.rendererState)

    // WORKAROUND: copyTextureToTexture throws error in WebGL.
    if (isWebGPU(renderer)) {
      this.copyDepthTexture(renderer)
    }
    this.swapBuffers()

    // Don't jitter the camera in subsequent render passes if any:
    if (this.needsSyncPostProcessing) {
      this.clearViewOffset()
    }
  }

  private setupResolveNode({ renderer }: NodeBuilder): Node {
    const getPreviousDepth = (uv: Node<'vec2'>): Node<'float'> => {
      const { previousDepthNode: depthNode } = this
      const depth = depthNode
        .load(ivec2(uv.mul(textureSize(depthNode)).sub(0.5)))
        .toVar()
      return renderer.logarithmicDepthBuffer
        ? logarithmicToPerspectiveDepth(
            depth,
            cameraNear(this.camera),
            cameraFar(this.camera)
          )
        : depth
    }

    return Fn(() => {
      const coord = ivec2(screenCoordinate)
      const uv = screenUV

      const currentColor = this.inputNode.load(coord)
      const closestDepth = getClosestDepth(this.depthNode, coord)
      const closestCoord = closestDepth.get('coord')

      const velocity = this.velocityNode
        .load(closestCoord)
        .xyz.mul(vec3(0.5, -0.5, 0.5)) // Velocity is in NDC offset
        .toVar()

      // Discards texels with velocity greater than the threshold:
      const velocityConfidence = velocity.xy
        .length()
        .div(this.velocityThreshold)
        .oneMinus()
        .saturate()

      const prevUV = uv.sub(velocity.xy).toVar()
      const prevDepth = getPreviousDepth(prevUV)

      // TODO: Add gather() in TextureNode and use it:
      const expectedDepth = renderer.logarithmicDepthBuffer
        ? logarithmicToPerspectiveDepth(
            closestDepth.get('depth'),
            cameraNear(this.camera),
            cameraFar(this.camera)
          )
        : closestDepth.get('depth')

      const depthConfidence = step(
        expectedDepth.add(velocity.z),
        prevDepth.add(this.depthError)
      )

      const confidence = velocityConfidence.mul(depthConfidence)

      const uvWeight = and(
        prevUV.greaterThanEqual(0).all(),
        prevUV.lessThanEqual(1).all()
      ).toFloat()

      // Don't apply TAA on the background:
      const depthWeight = closestDepth.get('depth').notEqual(1).toFloat()

      const outputColor = vec4(0).toVar()
      If(uvWeight.mul(depthWeight).mul(confidence).greaterThan(0), () => {
        const historyColor = texture(this.historyNode, prevUV)
        const clippedColor = varianceClipping(
          this.inputNode,
          coord,
          currentColor,
          historyColor,
          this.varianceGamma
        )

        // Increase the temporal alpha when the velocity is more subpixel,
        // reducing blurriness under motion.
        // Reference: https://github.com/simco50/D3D12_Research/
        const velocityAbsTexel = velocity.xy.abs().mul(screenSize)
        const subpixelCorrection = max(velocityAbsTexel.x, velocityAbsTexel.y)
          .fract()
          .mul(0.5)
        const temporalAlpha = mix(
          this.temporalAlpha,
          0.8,
          subpixelCorrection
        ).saturate()

        outputColor.assign(mix(clippedColor, currentColor, temporalAlpha))
      }).Else(() => {
        outputColor.assign(currentColor)
        if (this.debugShowRejection) {
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
      const { onBeforePostProcessing } = context
      context.onBeforePostProcessing = () => {
        onBeforePostProcessing?.()
        const size = builder.renderer.getDrawingBufferSize(sizeScratch)
        this.setViewOffset(size.width, size.height)
      }
      this.needsSyncPostProcessing = true
    }

    const { resolveMaterial, copyMaterial } = this

    resolveMaterial.fragmentNode = this.setupResolveNode(builder)
    resolveMaterial.needsUpdate = true

    copyMaterial.fragmentNode = this.inputNode
    copyMaterial.needsUpdate = true

    this.textureNode.uvNode = this.inputNode.uvNode
    return this.textureNode
  }

  override dispose(): void {
    this.resolveRT.dispose()
    this.historyRT.dispose()
    this.previousDepthTexture?.dispose()
    this.resolveMaterial.dispose()
    this.copyMaterial.dispose()
    this.mesh.geometry.dispose()
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
  ): TemporalAntialiasNode =>
    new TemporalAntialiasNode(
      velocityNodeImmutable,
      convertToTexture(inputNode, 'TemporalAntialiasNode.Input'),
      depthNode,
      velocityNode,
      camera
    )
