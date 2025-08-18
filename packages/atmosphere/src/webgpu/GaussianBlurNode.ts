import { GaussKernel } from 'postprocessing'
import { add, Fn, nodeObject, uniform, uv } from 'three/tsl'
import {
  ClampToEdgeWrapping,
  HalfFloatType,
  LinearFilter,
  NodeMaterial,
  NodeUpdateType,
  QuadMesh,
  RendererUtils,
  RenderTarget,
  RGBAFormat,
  TempNode,
  Vector2,
  type NodeBuilder,
  type NodeFrame,
  type TextureNode
} from 'three/webgpu'
import invariant from 'tiny-invariant'

import { outputTexture, type NodeObject } from '@takram/three-geospatial/webgpu'

declare module 'postprocessing' {
  interface GaussKernel {
    weights: Float64Array
    offsets: Float64Array
    linearWeights: Float64Array
    linearOffsets: Float64Array
    steps: number
    linearSteps: number
  }
}

function createRenderTarget(): RenderTarget {
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
  return renderTarget
}

let rendererState: RendererUtils.RendererState

export class GaussianBlurNode extends TempNode {
  static override get type(): string {
    return 'GaussianBlurNode'
  }

  inputNode: TextureNode | null
  kernelSize: number
  iterations: number
  resolution: Vector2

  private readonly horizontalRT = createRenderTarget()
  private readonly verticalRT = createRenderTarget()
  private readonly material = new NodeMaterial()
  private readonly mesh = new QuadMesh()

  private readonly texelSize = uniform(new Vector2())
  private readonly direction = uniform(new Vector2())

  // WORKAROUND: The leading underscore avoids infinite recursion.
  // https://github.com/mrdoob/three.js/issues/31522
  private readonly _textureNode: TextureNode

  constructor(
    inputNode: TextureNode | null,
    kernelSize = 35,
    iterations = 1,
    resolution = new Vector2(1, 1)
  ) {
    super('vec4')
    this.inputNode = inputNode
    this.kernelSize = kernelSize
    this.iterations = iterations
    this.resolution = resolution

    this._textureNode = outputTexture(this, this.verticalRT.texture)

    this.updateBeforeType = NodeUpdateType.RENDER
  }

  getTextureNode(): TextureNode {
    return this._textureNode
  }

  setSize(width: number, height: number): void {
    const w = Math.max(Math.round(width * this.resolution.x), 1)
    const h = Math.max(Math.round(height * this.resolution.y), 1)
    this.horizontalRT.setSize(w, h)
    this.verticalRT.setSize(w, h)
  }

  override updateBefore({ renderer }: NodeFrame): void {
    if (renderer == null) {
      return
    }
    rendererState = RendererUtils.resetRendererState(renderer, rendererState)

    const { horizontalRT, verticalRT, mesh, inputNode, direction } = this
    invariant(inputNode != null)

    const originalTexture = inputNode.value

    const { width, height } = inputNode.value
    this.setSize(width, height)

    this.texelSize.value.set(1 / width, 1 / height)

    for (let i = 0; i < this.iterations; ++i) {
      direction.value.set(1, 0)
      renderer.setRenderTarget(horizontalRT)
      mesh.render(renderer)
      inputNode.value = horizontalRT.texture

      direction.value.set(0, 1)
      renderer.setRenderTarget(verticalRT)
      mesh.render(renderer)
      inputNode.value = verticalRT.texture
    }

    RendererUtils.restoreRendererState(renderer, rendererState)

    inputNode.value = originalTexture
  }

  override setup(builder: NodeBuilder): unknown {
    const { inputNode, texelSize, direction } = this
    invariant(inputNode != null)
    const kernel = new GaussKernel(this.kernelSize, 2)

    const main = Fn(() => {
      const center = uv()
      const offsetSize = direction.mul(texelSize).toVertexStage()

      const result = inputNode.sample(center).mul(kernel.linearWeights[0])
      for (let i = 1; i < kernel.linearSteps; ++i) {
        const offset = offsetSize.mul(kernel.linearOffsets[i])
        result.addAssign(
          add(
            inputNode.sample(center.add(offset)),
            inputNode.sample(center.sub(offset))
          ).mul(kernel.linearWeights[i])
        )
      }
      return result
    })

    const { material } = this
    material.fragmentNode = main()
    material.needsUpdate = true

    this.mesh.material = material

    this._textureNode.uvNode = inputNode.uvNode
    return this._textureNode
  }

  override dispose(): void {
    super.dispose()
    this.horizontalRT.dispose()
    this.verticalRT.dispose()
    this.material.dispose()
    this.mesh.geometry.dispose()
  }
}

export const gaussianBlur = (
  ...args: ConstructorParameters<typeof GaussianBlurNode>
): NodeObject<GaussianBlurNode> => nodeObject(new GaussianBlurNode(...args))
