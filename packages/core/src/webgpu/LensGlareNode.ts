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
  storage,
  struct,
  texture,
  uniform,
  vec2,
  vec3,
  vec4
} from 'three/tsl'
import {
  AdditiveBlending,
  CanvasTexture,
  ClampToEdgeWrapping,
  HalfFloatType,
  LinearFilter,
  Mesh,
  MeshBasicNodeMaterial,
  NodeUpdateType,
  PerspectiveCamera,
  PlaneGeometry,
  RendererUtils,
  RenderTarget,
  RGBAFormat,
  Scene,
  SRGBColorSpace,
  StorageBufferAttribute,
  TempNode,
  Vector2,
  type ComputeNode,
  type NodeBuilder,
  type NodeFrame,
  type TextureNode
} from 'three/webgpu'
import invariant from 'tiny-invariant'

import type { Node, NodeObject } from './node'
import { outputTexture } from './OutputTextureNode'

const { resetRendererState, restoreRendererState } = RendererUtils

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

export class LensGlareNode extends TempNode {
  inputNode: TextureNode | null
  spikePairCount = 6
  resolutionScale = 0.5
  wireframe = false

  intensity = uniform(1e-5)
  sizeScale = uniform(new Vector2(1.5, 0.01))
  luminanceThreshold = uniform(100)

  private computeNode?: ComputeNode

  private readonly counterBuffer = new StorageBufferAttribute(1, 1)
  // TODO: Resize the buffer somehow during setSize:
  private readonly instanceBuffer = instancedArray(1000000, instanceStruct)

  private readonly renderTarget = createRenderTarget('LensGlareFeatures')
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
  private readonly tileSize = uniform(new Vector2())

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

    const { inputNode, computeNode, counterBuffer, renderTarget } = this
    invariant(inputNode != null)
    invariant(computeNode != null)

    const { width: inputWidth, height: inputHeight } = inputNode.value
    this.setSize(inputWidth, inputHeight)
    this.inputTexelSize.value.set(1 / inputWidth, 1 / inputHeight)
    const aspectRatio = inputWidth / inputHeight
    if (aspectRatio > 1) {
      this.geometryRatio.value.set(1 / aspectRatio, 1)
    } else {
      this.geometryRatio.value.set(1, aspectRatio)
    }

    const { width: outputWidth, height: outputHeight } = renderTarget
    this.outputTexelSize.value.set(1 / outputWidth, 1 / outputHeight)

    const tileWidth = Math.floor(outputWidth / 2)
    const tileHeight = Math.floor(outputHeight / 2)
    this.tileSize.value.set(tileWidth, tileHeight)

    // Reset the counter:
    counterBuffer.array[0] = 0
    counterBuffer.needsUpdate = true

    void renderer.computeAsync(computeNode, tileWidth * tileHeight)

    renderer
      .getArrayBufferAsync(counterBuffer)
      .then(arrayBuffer => {
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

  private setupComputeNode(): NodeObject<ComputeNode> {
    const {
      spikePairCount,
      inputNode,
      counterBuffer,
      instanceBuffer,
      outputTexelSize,
      tileSize
    } = this
    invariant(inputNode != null)

    const counterStorage = storage(
      counterBuffer,
      'uint',
      counterBuffer.count
    ).toAtomic()

    const id = instanceIndex
    const columns = tileSize.x
    const positionTile = vec2(id.mod(columns), id.div(columns))
    const uv = positionTile.mul(outputTexelSize).mul(2)
    const inputColor = inputNode.sample(uv)
    const inputLuminance = inputColor.a // Alpha channel stores luminance

    return Fn(() => {
      If(inputLuminance.greaterThan(0.1), () => {
        const countBefore = atomicAdd(counterStorage.element(0), spikePairCount)
        for (let i = 0; i < spikePairCount; ++i) {
          const instance = instanceBuffer.element(countBefore.add(i))
          instance.get('color').assign(inputColor.rgb)
          instance.get('luminance').assign(inputLuminance)
          instance.get('position').assign(positionTile)
          instance.get('scale').assign(i % 2 === 0 ? 1 : 0.5)

          const phi = 2.399963229728653
          const angle = (Math.PI / spikePairCount) * i + phi
          instance.get('sin').assign(Math.sin(angle))
          instance.get('cos').assign(Math.cos(angle))
        }
      })
    })().compute(1)
  }

  override setup(builder: NodeBuilder): unknown {
    const {
      inputNode,
      instanceBuffer,
      luminanceThreshold,
      intensity,
      sizeScale,
      outputTexelSize,
      geometryRatio
    } = this
    invariant(inputNode != null)

    this.computeNode = this.setupComputeNode()

    // TODO: Add a configurable node:
    const spikeTexture = createSpikeTexture()
    spikeTexture.colorSpace = SRGBColorSpace

    const instance = instanceBuffer.element(instanceIndex)
    const color = instance.get('color')
    const luminance = instance.get('luminance')

    this.material.colorNode = this.wireframe
      ? vec4(1)
      : texture(spikeTexture).mul(color.mul(intensity))

    this.material.vertexNode = Fn(() => {
      const sin = instance.get('sin')
      const cos = instance.get('cos')
      const rotation = mat3(cos, sin, 0, sin.negate(), cos, 0, 0, 0, 1)

      const positionTile = instance.get('position')
      const uv = positionTile.mul(outputTexelSize).mul(2)
      const centerPosition = uv.flipY().mul(2).sub(1)

      const normalizedLuminance = luminance.div(luminanceThreshold).saturate()
      const scale = vec2(normalizedLuminance, 1).mul(
        instance.get('scale'),
        sizeScale,
        // Make the spike to shrink at screen borders:
        uv.sub(0.5).length().mul(2).oneMinus().mul(0.5).add(0.5)
      )
      const position = rotation
        .mul(positionGeometry.mul(vec4(scale, 1, 1)))
        .mul(geometryRatio)
        .add(vec3(centerPosition, 0))
      return vec4(position, 1)
    })()

    this.material.wireframe = this.wireframe
    this.material.needsUpdate = true

    this._textureNode.uvNode = inputNode.uvNode
    return this._textureNode
  }
}

export const lensGlare = (inputNode: Node | null): NodeObject<LensGlareNode> =>
  nodeObject(
    new LensGlareNode(inputNode != null ? convertToTexture(inputNode) : null)
  )
