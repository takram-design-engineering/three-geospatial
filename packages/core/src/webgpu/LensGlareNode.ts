import {
  AdditiveBlending,
  CanvasTexture,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  Vector2
} from 'three'
import { hash } from 'three/src/nodes/core/NodeUtils.js'
import {
  atomicAdd,
  convertToTexture,
  Fn,
  If,
  instancedArray,
  instanceIndex,
  mat3,
  nodeObject,
  positionGeometry,
  Return,
  storage,
  struct,
  texture,
  uniform,
  uvec2,
  vec2,
  vec3,
  vec4
} from 'three/tsl'
import {
  MeshBasicNodeMaterial,
  RendererUtils,
  StorageBufferAttribute,
  type ComputeNode,
  type NodeBuilder,
  type NodeFrame,
  type TextureNode
} from 'three/webgpu'
import invariant from 'tiny-invariant'

import { FilterNode } from './FilterNode'
import type { Node, NodeObject } from './node'

const { resetRendererState, restoreRendererState } = RendererUtils

function createSpikeTexture(): CanvasTexture {
  const width = 256
  const height = 32
  const margin = 5
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  invariant(context != null)

  context.beginPath()
  context.moveTo(0, height / 2)
  context.lineTo(width / 2, margin)
  context.lineTo(width, height / 2)
  context.lineTo(width / 2, height - margin)
  context.closePath()

  const gradient = context.createLinearGradient(0, 0, width, 0)
  gradient.addColorStop(0, '#000000')
  gradient.addColorStop(0.5, '#ffffff')
  gradient.addColorStop(1, '#000000')
  context.fillStyle = gradient
  context.fill()

  return new CanvasTexture(canvas)
}

const instanceStruct = /*#__PURE__*/ struct({
  color: 'vec3',
  luminance: 'float',
  position: 'vec2',
  scale: 'float',
  sin: 'float',
  cos: 'float'
})

// Based on: https://www.froyok.fr/blog/2021-09-ue4-custom-lens-flare/
export class LensGlareNode extends FilterNode {
  spikeNode?: TextureNode | null
  spikePairCount = 6
  wireframe = false

  intensity = uniform(1e-5)
  sizeScale = uniform(new Vector2(1.5, 0.01))
  luminanceThreshold = uniform(100)

  private computeNode?: ComputeNode

  private readonly counterBuffer = new StorageBufferAttribute(1, 1)
  private instanceBuffer = instancedArray(1, instanceStruct)

  private readonly renderTarget = this.createRenderTarget()
  private readonly material = new MeshBasicNodeMaterial({
    depthTest: false,
    depthWrite: false,
    transparent: true,
    blending: AdditiveBlending
  })
  private readonly mesh = new Mesh(new PlaneGeometry(1, 1), this.material)
  private readonly camera = new PerspectiveCamera()
  private readonly scene = new Scene().add(this.mesh)
  private rendererState!: RendererUtils.RendererState

  private readonly inputTexelSize = uniform(new Vector2())
  private readonly outputTexelSize = uniform(new Vector2())
  private readonly geometryRatio = uniform(new Vector2())

  constructor(inputNode: TextureNode | null) {
    super(inputNode)
    this.inputNode = inputNode
    this.resolutionScale = 0.5

    this.setOutputTexture(this.renderTarget.texture)
  }

  override customCacheKey(): number {
    return hash(this.spikePairCount, +this.wireframe)
  }

  setSize(width: number, height: number): this {
    const { resolutionScale } = this
    const w = Math.max(Math.round(width * resolutionScale), 1)
    const h = Math.max(Math.round(height * resolutionScale), 1)
    this.renderTarget.setSize(w, h)

    const tileWidth = Math.floor(w / 2)
    const tileHeight = Math.floor(h / 2)
    const bufferCount = tileWidth * tileHeight
    // TODO: Buffering
    if (this.instanceBuffer.bufferCount < bufferCount) {
      this.instanceBuffer.dispose()
      this.instanceBuffer = instancedArray(bufferCount, instanceStruct)
      this.setupCompute(tileWidth, tileHeight)
      this.setupMaterial(tileWidth, tileHeight)
    }
    return this
  }

  override updateBefore({ renderer }: NodeFrame): void {
    if (renderer == null) {
      return
    }

    const { inputNode } = this
    invariant(inputNode != null)
    const { width: inputWidth, height: inputHeight } = inputNode.value
    this.setSize(inputWidth, inputHeight) // Compute node is initialized here.

    const { computeNode, counterBuffer, renderTarget } = this
    invariant(computeNode != null)

    this.inputTexelSize.value.set(1 / inputWidth, 1 / inputHeight)
    const aspectRatio = inputWidth / inputHeight
    if (aspectRatio > 1) {
      this.geometryRatio.value.set(1 / aspectRatio, 1)
    } else {
      this.geometryRatio.value.set(1, aspectRatio)
    }

    const { width: outputWidth, height: outputHeight } = renderTarget
    this.outputTexelSize.value.set(1 / outputWidth, 1 / outputHeight)

    // Reset the counter:
    counterBuffer.array[0] = 0
    counterBuffer.needsUpdate = true

    void renderer.computeAsync(computeNode)

    renderer
      .getArrayBufferAsync(counterBuffer)
      .then(arrayBuffer => {
        // TODO: This is indeed a couple of frames behind, thus the number of
        // computed instances above and the number of instances to be drawn by
        // the mesh differ. It is less problematic when the new counter value is
        // larger than the number of instances, but when it is smaller, garbage
        // instances will be drawn. This might be mitigated by clearing the
        // unused region of the instance buffer in the compute shader,
        // dispatching over all elements in it.
        this.mesh.count = new Uint32Array(arrayBuffer)[0]
      })
      .catch((error: unknown) => {
        console.error(error)
      })

    this.rendererState = resetRendererState(renderer, this.rendererState)

    renderer.setRenderTarget(renderTarget)
    void renderer.render(this.scene, this.camera)

    restoreRendererState(renderer, this.rendererState)
  }

  private setupCompute(tileWidth: number, tileHeight: number): void {
    const {
      spikePairCount,
      inputNode,
      counterBuffer,
      instanceBuffer,
      outputTexelSize
    } = this
    invariant(inputNode != null)

    const counterStorage = storage(
      counterBuffer,
      'uint',
      counterBuffer.count
    ).toAtomic()

    this.computeNode = Fn(() => {
      const id = instanceIndex
      const x = id.mod(tileWidth)
      const y = id.div(tileWidth)
      const tileSize = uvec2(tileWidth, tileHeight)
      If(uvec2(x, y).greaterThanEqual(tileSize).any(), () => {
        Return()
      })
      const positionTile = vec2(x, y)

      const uv = positionTile.mul(outputTexelSize).mul(2)
      const inputColor = inputNode.sample(uv)
      const inputLuminance = inputColor.a // Alpha channel stores luminance

      If(inputLuminance.greaterThan(0.1), () => {
        const countBefore = atomicAdd(counterStorage.element(0), spikePairCount)
        for (let i = 0; i < spikePairCount; ++i) {
          const instance = instanceBuffer.element(countBefore.add(i))
          instance.get('color').assign(inputColor.rgb)
          instance.get('luminance').assign(inputLuminance)
          instance.get('position').assign(positionTile)
          instance.get('scale').assign(i % 2 === 0 ? 1 : 0.5)

          const phi = Math.PI * (3 - Math.sqrt(5))
          const angle = (Math.PI / spikePairCount) * i + phi
          instance.get('sin').assign(Math.sin(angle))
          instance.get('cos').assign(Math.cos(angle))
        }
      })
    })().compute(tileWidth * tileHeight, [8, 8, 1])
  }

  private setupMaterial(tileWidth: number, tileHeight: number): void {
    const {
      inputNode,
      spikeNode,
      instanceBuffer,
      luminanceThreshold,
      intensity,
      sizeScale,
      outputTexelSize,
      geometryRatio
    } = this
    invariant(inputNode != null)
    invariant(spikeNode != null)

    const instance = instanceBuffer.element(instanceIndex)

    this.material.colorNode = this.wireframe
      ? vec4(1)
      : nodeObject(spikeNode).mul(instance.get('color').mul(intensity))

    this.material.vertexNode = Fn(() => {
      const sin = instance.get('sin')
      const cos = instance.get('cos')
      const rotation = mat3(cos, sin, 0, sin.negate(), cos, 0, 0, 0, 1)

      const positionTile = instance.get('position')
      const uv = positionTile.mul(outputTexelSize).mul(2)
      const positionNDC = uv.flipY().mul(2).sub(1)

      const luminance = instance.get('luminance')
      const luminanceScale = luminance.div(luminanceThreshold).saturate()
      const scale = vec2(luminanceScale, 1).mul(
        instance.get('scale'),
        sizeScale,
        // Make the spike to shrink at screen borders:
        uv.sub(0.5).length().mul(2).oneMinus().mul(0.5).add(0.5)
      )
      const position = rotation
        .mul(positionGeometry.mul(vec4(scale, 1, 1)))
        .mul(geometryRatio)
        .add(vec3(positionNDC, 0))
      return vec4(position, 1)
    })()

    this.material.wireframe = this.wireframe
    this.material.needsUpdate = true
  }

  override setup(builder: NodeBuilder): unknown {
    if (this.spikeNode == null) {
      const spikeTexture = createSpikeTexture()
      spikeTexture.colorSpace = SRGBColorSpace
      this.spikeNode = texture(spikeTexture)
    }
    return super.setup(builder)
  }
}

export const lensGlare = (inputNode: Node | null): NodeObject<LensGlareNode> =>
  nodeObject(
    new LensGlareNode(inputNode != null ? convertToTexture(inputNode) : null)
  )
