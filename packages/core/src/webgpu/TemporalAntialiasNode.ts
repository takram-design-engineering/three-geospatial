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
  convertToTexture,
  float,
  Fn,
  If,
  ivec2,
  max,
  mix,
  screenCoordinate,
  screenUV,
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
import { highpVelocity } from './HighpVelocityNode'
import { haltonOffsets } from './internals'
import type { Node } from './node'
import { outputTexture } from './OutputTextureNode'
import { logarithmicToPerspectiveDepth } from './transformations'
import { isWebGPU } from './utils'

const { resetRendererState, restoreRendererState } = RendererUtils

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

interface RenderPipelineContext {
  context: {
    onBeforeRenderPipeline?: () => void
    onAfterRenderPipeline?: () => void
  }
}

interface PostProcessingContext {
  context: {
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
  const pClip = maxColor.rgb.add(minColor.rgb).mul(0.5).toConst()
  const eClip = maxColor.rgb.sub(minColor.rgb).mul(0.5).add(1e-7)
  const vClip = history.sub(vec4(pClip, current.a)).toConst()
  const vUnit = vClip.xyz.div(eClip)
  const absUnit = vUnit.abs().toConst()
  const maxUnit = max(absUnit.x, absUnit.y, absUnit.z).toConst()
  return maxUnit
    .greaterThan(1)
    .select(vec4(pClip, current.a).add(vClip.div(maxUnit)), history)
})

const varianceOffsets = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, 0]
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

    for (const [x, y] of varianceOffsets) {
      const neighbor = inputNode.load(coord.add(ivec2(x, y))).toConst()
      moment1.addAssign(neighbor)
      moment2.addAssign(neighbor.pow2())
    }

    const N = varianceOffsets.length + 1
    const mean = moment1.div(N).toConst()
    const variance = sqrt(moment2.div(N).sub(mean.pow2()).max(0))
      .mul(gamma)
      .toConst()
    const minColor = mean.sub(variance).toConst()
    const maxColor = mean.add(variance).toConst()

    return clipAABB(mean.clamp(minColor, maxColor), history, minColor, maxColor)
  }
)

const neighborOffsets = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 0],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1]
]

const currentDepthStruct = /*#__PURE__*/ struct({
  closestCoord: 'ivec2',
  closestDepth: 'float'
})

const getCurrentDepth = /*#__PURE__*/ FnVar(
  (depthNode: TextureNode, inputCoord: Node<'ivec2'>) => builder => {
    const closestCoord = ivec2(0).toVar()
    const closestDepth = float(1).toVar()
    for (const [x, y] of neighborOffsets) {
      const neighbor = inputCoord.add(ivec2(x, y)).toConst()
      let depth = depthNode.load(neighbor).r
      if (builder.renderer.reversedDepthBuffer) {
        depth = depth.oneMinus()
      }
      depth = depth.toConst()

      If(depth.lessThan(closestDepth), () => {
        closestCoord.assign(neighbor)
        closestDepth.assign(depth)
      })
    }
    return currentDepthStruct(closestCoord, closestDepth)
  }
)

const subpixelCorrection = /*#__PURE__#*/ FnVar(
  (velocityUV: Node<'vec2'>, textureSize: Node<'ivec2'>): Node<'float'> => {
    const velocityTexel = velocityUV.mul(textureSize)
    const phase = velocityTexel.fract().abs()
    const weight = max(phase, phase.oneMinus())
    return weight.x.mul(weight.y).oneMinus().div(0.75)
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

  inputNode: TextureNode
  depthNode: TextureNode
  velocityNode: TextureNode
  camera: SupportedCamera

  temporalAlpha = uniform(0.05)
  varianceGamma = uniform(1)
  velocityThreshold = uniform(0.1)
  depthError = uniform(0.001)

  debugShowRejection = false

  private readonly textureNode: TextureNode

  private resolveRT = this.createRenderTarget('resolve')
  private historyRT = this.createRenderTarget('history')
  private previousDepthTexture?: DepthTexture
  private readonly resolveMaterial = new NodeMaterial()
  private readonly mesh = new QuadMesh()
  private rendererState?: RendererUtils.RendererState
  private needsSyncRenderPipeline = false
  private needsClearHistory = false

  private readonly resolveNode = texture(this.resolveRT.texture)
  private readonly historyNode = texture(this.historyRT.texture)
  private readonly previousDepthNode = texture(emptyDepthTexture)
  private readonly originalProjectionMatrix = new Matrix4()
  private jitterIndex = 0

  constructor(
    inputNode: TextureNode,
    depthNode: TextureNode,
    velocityNode: TextureNode,
    camera: Camera
  ) {
    super('vec4')
    this.updateBeforeType = NodeUpdateType.FRAME
    this.resolveMaterial.name = 'TemporalAntialias_resolve'
    this.mesh.name = 'TemporalAntialias'

    this.inputNode = inputNode
    this.depthNode = depthNode
    this.velocityNode = velocityNode
    if (!isSupportedCamera(camera)) {
      throw new Error('The provided camera is not supported.')
    }
    this.camera = camera

    this.textureNode = outputTexture(this, this.resolveRT.texture)
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

    const typeName = (this.constructor as typeof Node).type
    texture.name = name != null ? `${typeName}_${name}` : typeName

    return renderTarget
  }

  getTextureNode(): TextureNode {
    return this.textureNode
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

    this.needsClearHistory = false
  }

  private setViewOffset(width: number, height: number): void {
    // Store the unjittered projection matrix:
    const { camera } = this
    camera.updateProjectionMatrix()
    this.originalProjectionMatrix.copy(camera.projectionMatrix)
    highpVelocity.setProjectionMatrix(this.originalProjectionMatrix)

    const offset = haltonOffsets[this.jitterIndex]
    const dx = offset.x - 0.5
    const dy = offset.y - 0.5
    camera.setViewOffset(width, height, dx, dy, width, height)
  }

  private clearViewOffset(): void {
    // Reset the projection matrix modified in setViewOffset():
    this.camera.clearViewOffset()
    highpVelocity.setProjectionMatrix(null)

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
    if (this.needsSyncRenderPipeline) {
      this.clearViewOffset()
    }
  }

  private setupResolveNode({ renderer }: NodeBuilder): Node {
    const getPreviousDepth = (uv: Node<'vec2'>): Node<'float'> => {
      const { previousDepthNode: depthNode } = this
      const depth = depthNode
        .load(ivec2(uv.mul(depthNode.size()).sub(0.5)))
        .toConst()
      return renderer.logarithmicDepthBuffer
        ? logarithmicToPerspectiveDepth(
            depth,
            cameraNear(this.camera),
            cameraFar(this.camera)
          )
        : renderer.reversedDepthBuffer
          ? depth.oneMinus()
          : depth
    }

    return Fn(() => {
      const coord = ivec2(screenCoordinate)
      const uv = screenUV

      const currentDepth = getCurrentDepth(this.depthNode, coord).toConst()
      const closestCoord = currentDepth.get('closestCoord')
      const closestDepth = currentDepth.get('closestDepth')

      const velocityUVW = this.velocityNode
        .load(closestCoord)
        .xyz.mul(vec3(0.5, -0.5, 0.5)) // Velocity is in NDC offset
        .toConst()

      // Discards texels with velocity greater than the threshold:
      const velocityConfidence = velocityUVW.xy
        .length()
        .div(this.velocityThreshold)
        .oneMinus()
        .saturate()

      const prevUV = uv.sub(velocityUVW.xy).toConst()
      const prevDepth = getPreviousDepth(prevUV)

      // TODO: Add gather() in TextureNode and use it:
      const expectedDepth = renderer.logarithmicDepthBuffer
        ? logarithmicToPerspectiveDepth(
            closestDepth,
            cameraNear(this.camera),
            cameraFar(this.camera)
          )
        : closestDepth

      const depthConfidence = step(
        expectedDepth.add(velocityUVW.z),
        prevDepth.add(this.depthError)
      )

      const confidence = velocityConfidence.mul(depthConfidence)

      const uvWeight = and(
        prevUV.greaterThanEqual(0).all(),
        prevUV.lessThanEqual(1).all()
      ).toFloat()

      // Don't apply TAA on the background:
      const depthWeight = closestDepth.notEqual(1).toFloat()

      const outputColor = this.inputNode.load(coord).toVar()
      If(uvWeight.mul(depthWeight).mul(confidence).greaterThan(0), () => {
        const historyColor = texture(this.historyNode, prevUV)
        const clippedColor = varianceClipping(
          this.inputNode,
          coord,
          outputColor,
          historyColor,
          this.varianceGamma
        )

        // Increase the temporal alpha when the velocity is more subpixel,
        // reducing blurriness under motion.
        // Reference: https://github.com/simco50/D3D12_Research/
        const temporalAlpha = mix(
          this.temporalAlpha,
          0.4,
          subpixelCorrection(velocityUVW.xy, textureSize(this.inputNode))
        ).saturate()

        outputColor.assign(mix(clippedColor, outputColor, temporalAlpha))
      }).Else(() => {
        if (this.debugShowRejection) {
          outputColor.assign(vec3(1, 0, 0))
        }
      })

      return outputColor
    })()
  }

  override setup(builder: NodeBuilder): unknown {
    // We have to take care of the renaming of PostProcessing to RenderPipeline
    // in r183, as well as changes to property fields in the context.
    const onBeforeRenderPipeline = (): void => {
      const size = builder.renderer.getDrawingBufferSize(sizeScratch)
      this.setViewOffset(size.width, size.height)
    }
    if (builder.context.renderPipeline != null) {
      const { context } = builder.context
        .renderPipeline as RenderPipelineContext
      context.onBeforeRenderPipeline = onBeforeRenderPipeline
      this.needsSyncRenderPipeline = true
    }
    if (builder.context.postProcessing != null) {
      const { context } = builder.context
        .postProcessing as PostProcessingContext
      context.onBeforePostProcessing = onBeforeRenderPipeline
      this.needsSyncRenderPipeline = true
    }

    const { resolveMaterial } = this

    resolveMaterial.fragmentNode = this.setupResolveNode(builder)
    resolveMaterial.needsUpdate = true

    this.textureNode.uvNode = this.inputNode.uvNode
    return this.textureNode
  }

  override dispose(): void {
    this.resolveRT.dispose()
    this.historyRT.dispose()
    this.previousDepthTexture?.dispose()
    this.resolveMaterial.dispose()
    this.mesh.geometry.dispose()
    super.dispose()
  }
}

/**
 * @deprecated Function signature has been changed. Use
 *   temporalAntialias(inputNode, depthNode, velocityNode, camera)
 */
export function temporalAntialias(
  velocityNodeImmutable: unknown
): (
  inputNode: Node,
  depthNode: TextureNode,
  velocityNode: TextureNode,
  camera: Camera
) => TemporalAntialiasNode

export function temporalAntialias(
  inputNode: Node,
  depthNode: TextureNode,
  velocityNode: TextureNode,
  camera: Camera
): TemporalAntialiasNode

export function temporalAntialias(...args: any[]): any {
  if (args.length === 1) {
    return (
      inputNode: Node,
      depthNode: TextureNode,
      velocityNode: TextureNode,
      camera: Camera
    ): TemporalAntialiasNode =>
      new TemporalAntialiasNode(
        convertToTexture(inputNode),
        depthNode,
        velocityNode,
        camera
      )
  }
  const [inputNode, depthNode, velocityNode, camera] = args
  return new TemporalAntialiasNode(
    convertToTexture(inputNode),
    depthNode,
    velocityNode,
    camera
  )
}

// export const temporalAntialias = (
//   inputNode: Node,
//   depthNode: TextureNode,
//   velocityNode: TextureNode,
//   camera: Camera
// ): TemporalAntialiasNode =>
//   new TemporalAntialiasNode(
//     convertToTexture(inputNode),
//     depthNode,
//     velocityNode,
//     camera
//   )
