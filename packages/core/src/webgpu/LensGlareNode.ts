import {
  AdditiveBlending,
  CanvasTexture,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  SRGBColorSpace,
  Vector2,
  type Texture
} from 'three'
import {
  atomicAdd,
  Fn,
  globalId,
  If,
  instancedArray,
  instanceIndex,
  mat3,
  positionGeometry,
  Return,
  storage,
  struct,
  texture,
  uniform,
  vec2,
  vec3,
  vec4
} from 'three/tsl'
import {
  IndirectStorageBufferAttribute,
  MeshBasicNodeMaterial,
  RendererUtils,
  type ComputeNode,
  type NodeBuilder,
  type NodeFrame,
  type TextureNode
} from 'three/webgpu'
import invariant from 'tiny-invariant'

import { FilterNode } from './FilterNode'
import type { Node } from './node'
import { convertToTexture } from './RenderTargetNode'
import { hashValues } from './utils'

const { resetRendererState, restoreRendererState } = RendererUtils

const glareColors: ReadonlyArray<[number, string]> = [
  [0.0, '#000'],
  [0.25, '#666633'],
  [0.35, '#996633'],
  [0.45, '#9999cc'],
  [0.5, '#99ccff'],
  [0.65, '#fff'],
  [0.9, '#ccc'],
  [1, '#666']
]

function createQuadTexture(): CanvasTexture {
  const width = 256
  const height = 32
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')!

  context.fillStyle = '#000'
  context.fillRect(0, 0, width, height)
  context.filter = 'blur(3px)'

  const colorGradient = context.createLinearGradient(0, 0, width, 0)
  glareColors.forEach(([t, color]) => {
    colorGradient.addColorStop(t * 0.5, color)
  })
  glareColors.forEach(([t, color]) => {
    colorGradient.addColorStop(1 - t * 0.5, color)
  })
  context.fillStyle = colorGradient
  const inset = 5
  context.fillRect(0, inset, width, height - inset * 2)

  const blackGradient = context.createLinearGradient(0, 0, width, 0)
  blackGradient.addColorStop(0, 'rgba(0, 0, 0, 1)')
  blackGradient.addColorStop(0.5, 'rgba(0, 0, 0, 0)')
  blackGradient.addColorStop(1, 'rgba(0, 0, 0, 1)')
  context.fillStyle = blackGradient
  context.fillRect(0, 0, width, height)

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.generateMipmaps = false
  texture.needsUpdate = true
  texture.name = 'LensGlare [Quad]'
  return texture
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
  static override get type(): string {
    return 'LensGlareNode'
  }

  quadTexture: Texture = createQuadTexture()
  quadCount = 6
  wireframe = false

  intensity = uniform(1e-5)
  sizeScale = uniform(new Vector2(1, 0.01)) // length, width
  luminanceThreshold = uniform(100)

  private computeNode?: ComputeNode

  // drawIndexedIndirect format:
  // [indexCount, instanceCount, firstIndex, baseVertex, firstInstance]
  private readonly indirectBuffer = new IndirectStorageBufferAttribute(
    new Uint32Array([6, 0, 0, 0, 0]),
    1
  )
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
  private rendererState?: RendererUtils.RendererState

  private readonly tileSize = uniform('uvec2')
  private readonly inputTexelSize = uniform('vec2')
  private readonly outputTexelSize = uniform('vec2')
  private readonly geometryRatio = uniform('vec2')

  constructor(inputNode: TextureNode | null = null) {
    super(inputNode)
    this.material.name = 'LensGlare'

    this.inputNode = inputNode

    this.outputTexture = this.renderTarget.texture
    this.mesh.geometry.indirect = this.indirectBuffer
  }

  override customCacheKey(): number {
    return hashValues(this.quadCount, this.wireframe)
  }

  setSize(width: number, height: number): this {
    const { resolutionScale } = this
    const w = Math.max(Math.round(width * resolutionScale), 1)
    const h = Math.max(Math.round(height * resolutionScale), 1)
    this.renderTarget.setSize(w, h)

    const tileWidth = Math.floor(w / 2) // Stride of 2
    const tileHeight = Math.floor(h / 2)
    this.tileSize.value.set(tileWidth, tileHeight)

    // NOTE: Buffering here doesn't really work and causes a performance
    // ramification. It needs further investigations.
    const bufferCount = tileWidth * tileHeight
    if (this.instanceBuffer.bufferCount < bufferCount) {
      this.instanceBuffer.dispose()
      this.instanceBuffer = instancedArray(bufferCount, instanceStruct)

      this.setupCompute()
      this.setupMaterial()
    }
    return this
  }

  override updateBefore({ renderer }: NodeFrame): void {
    if (renderer == null) {
      return
    }

    const { inputNode } = this
    if (inputNode == null) {
      return
    }

    const { width: inputWidth, height: inputHeight } = inputNode.value
    this.setSize(inputWidth, inputHeight) // Compute node is initialized here.

    const { computeNode, indirectBuffer, renderTarget } = this
    if (computeNode == null) {
      return
    }

    this.inputTexelSize.value.set(1 / inputWidth, 1 / inputHeight)
    const aspectRatio = inputWidth / inputHeight
    if (aspectRatio > 1) {
      this.geometryRatio.value.set(1 / aspectRatio, 1)
    } else {
      this.geometryRatio.value.set(1, aspectRatio)
    }

    const { width: outputWidth, height: outputHeight } = renderTarget
    this.outputTexelSize.value.set(1 / outputWidth, 1 / outputHeight)

    // Reset instanceCount in the indirect buffer:
    indirectBuffer.array[1] = 0
    indirectBuffer.needsUpdate = true

    const { width: tileWidth, height: tileHeight } = this.tileSize.value
    void renderer.compute(computeNode, [
      Math.ceil(tileWidth / 8),
      Math.ceil(tileHeight / 8),
      1
    ])

    this.rendererState = resetRendererState(renderer, this.rendererState)

    renderer.setRenderTarget(renderTarget)
    renderer.render(this.mesh, this.camera)

    restoreRendererState(renderer, this.rendererState)
  }

  private setupCompute(): void {
    const {
      quadCount,
      inputNode,
      indirectBuffer,
      instanceBuffer,
      tileSize,
      outputTexelSize
    } = this
    invariant(inputNode != null, 'inputNode cannot be null during setup.')

    const indirectStorage = storage(
      indirectBuffer,
      'uint',
      indirectBuffer.count
    ).toAtomic()

    this.computeNode = Fn(() => {
      If(globalId.xy.greaterThanEqual(tileSize).any(), () => {
        Return()
      })

      const texelSize = outputTexelSize.mul(2) // Stride of 2
      const uv = vec2(globalId.xy).mul(texelSize)
      const inputColor = inputNode.sample(uv)
      const inputLuminance = inputColor.a // Alpha channel stores luminance

      If(inputLuminance.greaterThan(0.1), () => {
        // The first element is instanceCount in the drawIndexedIndirect buffer.
        const countBefore = atomicAdd(indirectStorage.element(1), quadCount)
        for (let i = 0; i < quadCount; ++i) {
          const instance = instanceBuffer.element(countBefore.add(i))
          instance.get('color').assign(inputColor.rgb)
          instance.get('luminance').assign(inputLuminance)
          instance.get('position').assign(globalId.xy)
          instance.get('scale').assign(i % 2 === 0 ? 1 : 0.5)

          const phi = Math.PI * (3 - Math.sqrt(5))
          const angle = (Math.PI / quadCount) * i + phi
          instance.get('sin').assign(Math.sin(angle))
          instance.get('cos').assign(Math.cos(angle))
        }
      })
    })()
      .computeKernel([8, 8, 1])
      .setName('LensGlare')
  }

  private setupMaterial(): void {
    const {
      quadTexture,
      instanceBuffer,
      luminanceThreshold,
      intensity,
      sizeScale,
      outputTexelSize,
      geometryRatio
    } = this

    const instance = instanceBuffer.element(instanceIndex)

    this.material.colorNode = this.wireframe
      ? vec4(1)
      : texture(quadTexture).mul(instance.get('color').mul(intensity))

    this.material.vertexNode = Fn(() => {
      const sin = instance.get('sin')
      const cos = instance.get('cos')
      const rotation = mat3(cos, sin, 0, sin.negate(), cos, 0, 0, 0, 1)

      const positionTile = instance.get('position')
      const texelSize = outputTexelSize.mul(2) // Stride of 2
      const uv = positionTile.mul(texelSize).toConst()
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
    const { inputNode } = this
    invariant(inputNode != null, 'inputNode cannot be null during setup.')
    // We are going to use the input node in the compute shader, while it's not
    // setup at this time. Manually add the input node to dependency here,
    // otherwise it lags 1 frame behind.
    inputNode.setup(builder)

    this.setupMaterial()

    return super.setup(builder)
  }

  override dispose(): void {
    this.quadTexture.dispose()
    this.renderTarget.dispose()
    this.material.dispose()
    this.mesh.geometry.dispose()
    super.dispose()
  }
}

export const lensGlare = (inputNode: Node | null): LensGlareNode =>
  new LensGlareNode(convertToTexture(inputNode, { name: 'LensGlare [Input]' }))
